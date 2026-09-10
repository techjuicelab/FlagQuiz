/* 실제 app.js와 채점 엔진을 가상 DOM/마이크에서 연결해 화면 간 경합을 검사한다.
 * 브라우저의 실제 마이크 권한·음성 품질은 이 검사 범위에 포함하지 않는다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture() {
  const nodes = new Map(), events = {}, spoken = [], releases = [], timers = new Map(), local = new Map();
  const delegated = [], playbackFailures = [], modals = [];
  let timerId = 0;
  function node(sel) {
    if (!nodes.has(sel)) {
      const classes = new Set();
      nodes.set(sel, {
        value: '', checked: false, disabled: false, textContent: '', style: {}, tagName: 'BUTTON', attrs: {}, handlers: {},
        classList: {add:(c)=>classes.add(c), remove:(c)=>classes.delete(c), toggle:(c)=>classes.has(c)?classes.delete(c):classes.add(c), contains:(c)=>classes.has(c)},
        addEventListener(type, fn){this.handlers[type] = fn;},
        click(){if (!this.disabled) this.handlers.click?.({target:this});},
        setAttribute(k,v){this.attrs[k]=v;}, getAttribute(k){return this.attrs[k]??'';},
        querySelector: node, querySelectorAll:()=>[], appendChild(){}, remove(){}, focus(){}, scrollIntoView(){},
        set innerHTML(html){
          this.html=html;
          for (const m of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) node('#'+m[1]).disabled=/\sdisabled(?:[\s>]|$)/.test(m[0]);
        },
        get innerHTML(){return this.html??'';}
      });
    }
    return nodes.get(sel);
  }
  const c={console, Math, Date, JSON, Object, Array, String, Number, Image:function(){},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;}, clearTimeout:(id)=>timers.delete(id),
    setInterval(fn,delay){const id=++timerId;timers.set(id,{fn,delay,interval:true});return id;}, clearInterval:(id)=>timers.delete(id),
    localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)},
    document:{hidden:false,readyState:'loading',addEventListener(type,fn){(events[type]??=[]).push(fn);},querySelector:()=>null,body:node('body'),createElement:()=>node('created'),getElementById:(id)=>node('#'+id)},
    navigator:{}, location:{protocol:'http:',hostname:'localhost'},confirm:()=>true,addEventListener(){},
    requestAnimationFrame(){},cancelAnimationFrame(){},matchMedia:()=>({matches:false}),scrollTo(){},
    FQ:{ui:{$:node,$$:()=>[],esc:String,setMain(html){node('main').innerHTML=html;return node('main');},
      on(root,selector,event,fn){delegated.push({selector,event,fn});},countryModal(country){modals.push(country);},flagSrc:code=>'flags/'+code+'.svg'},
      audio:{setEnabled(){},setSpeakEnabled(){},unlock(){},stopSpeaking(){},play(){},
        say(lines,opts,onFail){spoken.push([...lines]);playbackFailures.push(onFail);}},
      effects:{celebrate:()=> '정답',burst(){}},badges:{check:()=>[]},screens:{dex(){},stats(){}},
      speech:{unavailableReason:()=>null,blocked:()=>false,
        start(callbacks){c.callbacks=callbacks;c.listening=true;return true;},
        abort(){c.listening=false;},stopAnd(cb){c.listening=false;releases.push(cb);},isListening:()=>!!c.listening}
    }};
  c.window=c;vm.createContext(c);
  for(const file of ['js/util.js','js/storage.js','data/countries.js','js/progress.js','js/quiz.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c,{filename:file});
  // 제품 코드에는 테스트 전용 진입점을 추가하지 않고 VM 안에서만 내부 상태를 노출한다.
  const source=fs.readFileSync(path.join(root,'js/app.js'),'utf8').replace('FQ.app = { home:',
    'FQ.test = {state:state,startListening:startListening,submit:submit,goNext:goNext,toggleMic:toggleMic};\n  FQ.app = { home:');
  vm.runInContext(source,c,{filename:'js/app.js'});
  function runDelay(delay){for(const [id,t] of [...timers])if(t.delay===delay){if(!t.interval)timers.delete(id);t.fn();}}
  function startVoice(only=['id','in']){
    c.FQ.storage.updateSettings({mode:'voice'});
    c.FQ.app.startGame(only);
    return c.FQ.test;
  }
  function clickDelegated(selector,target){delegated.filter(item=>item.selector===selector&&item.event==='click').at(-1).fn({target},target);}
  return {c,node,nodes,events,spoken,releases,timers,runDelay,startVoice,clickDelegated,playbackFailures,modals};
}

let passed=0;
function test(name,fn){fn();passed++;console.log('✓ '+name);}

test('중간 인도 이후 최종 인도네시아를 끝까지 듣고 정답으로 인정',()=>{
  const f=fixture(),a=f.startVoice(['id']);
  assert.equal(f.node('#mic').attrs['aria-pressed'],'false');
  f.c.callbacks.start();
  assert.equal(f.node('#mic').attrs['aria-pressed'],'true');
  f.c.callbacks.interim('인도');
  assert.equal(a.state.answered,false);
  assert.equal(f.node('#heard').textContent,'인도');
  f.c.callbacks.result(['인도네시아']);
  assert.equal(a.state.game.correct,1);
});

test('최종 전사에 실제 다른 나라가 있으면 한 번만 오답 처리',()=>{
  const f=fixture(),a=f.startVoice(['id']);
  f.c.callbacks.result(['인도']);f.c.callbacks.result(['인도네시아']);
  assert.equal(a.state.game.correct,0);
  assert.equal(a.state.game.wrong.length,1);
});

test('정답 설명에 상식을 넣고 정답 화면에도 다시 듣기 제공',()=>{
  const f=fixture(),a=f.startVoice(['id']);
  a.submit({code:'id'});
  assert.ok(a.state.lastSpeech.lines.includes(f.c.FQ.quiz.byCode('id').fact));
  assert.match(f.node('#feedback-area').innerHTML,/id="replay"/);
});

test('정답 직후 다시 듣기를 누르면 마이크 해제를 기다리고 자동 안내와 겹치지 않음',()=>{
  const f=fixture(),a=f.startVoice(['id']);a.submit({code:'id'});
  f.node('#replay').click();assert.equal(f.spoken.length,0);
  f.releases[0]();f.runDelay(180);assert.equal(f.spoken.length,0);
  f.releases[1]();assert.equal(f.spoken.length,1);
});

test('다음 문제를 연 뒤 도착한 마이크 해제 콜백이 이전 답을 읽지 않음',()=>{
  const f=fixture(),a=f.startVoice();
  a.submit({code:a.state.game.current().country.code});
  const release=f.releases[0];a.goNext();release();f.runDelay(180);
  assert.equal(a.state.game.index,1);
  assert.equal(f.c.listening,true);
  assert.equal(f.spoken.length,0);
});

test('실제 speech.js와 연결해 빠르게 다음 문제로 넘어가도 이전 결과를 버리고 다시 듣기',()=>{
  const f=fixture(), recognizers=[];
  f.c.isSecureContext=true;
  f.c.SpeechRecognition=class {
    constructor(){recognizers.push(this);this.starts=0;}
    start(){this.starts++;} stop(){} abort(){}
  };
  vm.runInContext(fs.readFileSync(path.join(root,'js/speech.js'),'utf8'),f.c,{filename:'js/speech.js'});
  const a=f.startVoice(),r=recognizers[0];r.onstart();
  const answer=a.state.game.current().country.ko;
  const result=[{transcript:answer}];result.isFinal=true;
  r.onresult({resultIndex:0,results:[result]});
  assert.equal(a.state.answered,true);
  a.goNext();r.onresult({resultIndex:0,results:[result]});
  assert.equal(a.state.answered,false);
  r.onend();f.runDelay(60);r.onstart();
  assert.equal(r.starts,2);
  assert.equal(f.node('#mic').attrs['aria-pressed'],'true');
  assert.equal(f.spoken.length,0);
});

test('예약된 안내도 홈 화면으로 이동하면 취소',()=>{
  const f=fixture(),a=f.startVoice();
  a.submit({code:a.state.game.current().country.code});f.releases[0]();
  f.c.FQ.app.home();f.runDelay(180);
  assert.equal(f.spoken.length,0);assert.equal(a.state.game,null);
});

test('5연속 뒤 즉시 결과로 이동해도 보너스와 경험치가 먼저 기록됨',()=>{
  const f=fixture(),a=f.c.FQ.test;
  a.state.game=f.c.FQ.quiz.createGame({mode:'choice4',count:5});
  for(let i=0;i<5;i++){a.submit({code:a.state.game.current().country.code});a.goNext();}
  assert.equal(a.state.lastSummary.score,70);
  assert.equal(a.state.lastSummary.bonusScore,5);
  assert.equal(a.state.xpGained,85);
  assert.ok(![...f.timers.values()].some(t=>t.delay===950));
  f.runDelay(950);
  assert.equal(a.state.game.score,70);
});

test('다시 듣기 버튼의 Enter를 다음 문제로 가로채지 않음',()=>{
  const f=fixture(),a=f.startVoice(['id']);a.state.answered=true;
  let prevented=false,clicked=false;f.node('#next').handlers.click=()=>{clicked=true;};
  f.events.keydown[0]({key:'Enter',target:{tagName:'BUTTON',id:'replay'},preventDefault(){prevented=true;}});
  assert.equal(prevented,false);assert.equal(clicked,false);
});

test('연결 오류는 세 번에서 멈추고 마이크 재시도가 가능',()=>{
  const f=fixture(),a=f.startVoice(['id']);
  for(let i=1;i<=3;i++){
    f.c.listening=false;f.c.callbacks.error('network');f.c.callbacks.end();f.runDelay(Math.min(i*750,2000));
  }
  assert.equal(a.state.listenFailures,3);assert.equal(a.state.listenOn,false);
  assert.equal(f.node('#mic').disabled,false);assert.equal(f.node('.type-fallback').open,true);
  a.toggleMic();assert.equal(a.state.listenOn,true);assert.equal(a.state.listenFailures,0);
});

test('권한 거절 뒤 권한을 바꿔도 화면을 새로 열 필요 없이 재시도',()=>{
  const f=fixture(),a=f.startVoice(['id']);
  f.c.listening=false;f.c.callbacks.error('not-allowed');
  assert.equal(a.state.listenOn,false);assert.equal(f.node('#mic').disabled,false);
  a.toggleMic();assert.equal(a.state.listenOn,true);
});

test('동기 시작 실패는 end 이벤트 없이도 제한적으로 재시도',()=>{
  const f=fixture();let attempts=0;
  f.c.FQ.speech.start=(cbs)=>{attempts++;cbs.error('start-failed');return false;};
  const a=f.startVoice(['id']);f.runDelay(750);f.runDelay(1500);f.runDelay(2000);
  assert.equal(attempts,3);assert.equal(a.state.listenOn,false);
});

test('종료 대기 뒤 예약된 마이크 시작 실패도 다시 시도',()=>{
  const f=fixture(),a=f.startVoice(['id']);
  f.c.listening=false;f.c.callbacks.error('start-failed');
  const first=f.c.callbacks;f.runDelay(750);
  assert.notEqual(f.c.callbacks,first);assert.equal(a.state.listenOn,true);
});

test('마이크 준비 시간 초과는 자동 반복하지 않고 권한 확인과 수동 재시도로 안내',()=>{
  const f=fixture(),a=f.startVoice(['id']);
  f.c.listening=false;f.c.callbacks.error('start-timeout');f.c.callbacks.end();
  assert.equal(a.state.listenOn,false);assert.equal(a.state.listenTimer,null);
  assert.match(f.node('#listen-state').textContent,/권한 허용/);
  assert.equal(f.node('#mic').disabled,false);
});

test('백그라운드에서 마이크와 제한 시간을 멈추고 화면 복귀 시 수동 듣기로 안내',()=>{
  const f=fixture();f.c.FQ.app.boot();f.c.FQ.storage.updateSettings({timer:10});
  const a=f.startVoice(['id']);f.runDelay(1000);assert.equal(a.state.timeLeft,9);
  f.c.document.hidden=true;f.events.visibilitychange[0]();
  assert.equal(f.c.listening,false);assert.equal(a.state.timerId,null);assert.equal(a.state.timerPaused,true);
  f.c.document.hidden=false;f.events.visibilitychange[0]();
  assert.equal(a.state.timeLeft,9);assert.equal(a.state.listenOn,false);
  assert.match(f.node('#listen-state').textContent,/마이크를 눌러/);
});

test('정답 화면을 숨겼다가 돌아와도 설명 다시 듣기 가능',()=>{
  const f=fixture();f.c.FQ.app.boot();const a=f.startVoice(['id']);a.submit({code:'id'});
  f.c.document.hidden=true;f.events.visibilitychange[0]();
  f.c.document.hidden=false;f.events.visibilitychange[0]();
  f.node('#replay').click();f.releases.at(-1)();assert.equal(f.spoken.length,1);
});

test('마지막 정답 직후 결과로 가도 실제 마이크 해제 전에는 응원을 시작하지 않음',()=>{
  const f=fixture(),recognizers=[];
  f.c.isSecureContext=true;
  f.c.SpeechRecognition=class {constructor(){recognizers.push(this);}start(){}stop(){}abort(){}};
  vm.runInContext(fs.readFileSync(path.join(root,'js/speech.js'),'utf8'),f.c,{filename:'js/speech.js'});
  const a=f.startVoice(['kr']),r=recognizers[0];r.onstart();
  a.submit({code:'kr'});a.goNext();
  assert.equal(f.spoken.length,0);
  r.onend();f.runDelay(60);f.runDelay(180);
  assert.deepEqual(f.spoken,[['대단해요! 세계 국기 박사님!']]);
});

test('결과 자동 응원 대기 중 다시 듣기를 눌러도 최신 요청만 재생하고 실패를 안내',()=>{
  const f=fixture(),a=f.startVoice(['kr']);a.submit({code:'kr'});a.goNext();
  const auto=f.releases.at(-1);f.node('#result-replay').click();const replay=f.releases.at(-1);
  auto();assert.equal(f.spoken.length,0);
  replay();assert.deepEqual(f.spoken,[['대단해요! 세계 국기 박사님!']]);
  assert.equal(typeof f.playbackFailures[0],'function');f.playbackFailures[0]();
  assert.match(f.node('#result-replay').textContent,/눌러서/);
});

test('결과 화면의 나라 설명을 열면 예약된 응원이 뒤늦게 설명을 끊지 않음',()=>{
  const f=fixture(),a=f.startVoice(['kr']);a.submit({text:''},true);a.goNext();
  const pending=f.releases.at(-1),target=f.node('wrong-item');target.setAttribute('data-code','kr');
  f.clickDelegated('.wrong-item',target);pending();
  assert.equal(f.modals.length,1);assert.equal(f.spoken.length,0);
});

test('결과 응원 대기는 화면 이동으로 취소하고 백그라운드 복귀 후에는 수동으로 다시 듣기',()=>{
  const f=fixture();f.c.FQ.app.boot();const a=f.startVoice(['kr']);a.submit({code:'kr'});a.goNext();
  const pending=f.releases.at(-1);
  f.c.document.hidden=true;f.events.visibilitychange[0]();
  f.c.document.hidden=false;f.events.visibilitychange[0]();pending();assert.equal(f.spoken.length,0);
  f.node('#result-replay').click();f.releases.at(-1)();assert.equal(f.spoken.length,1);
  f.node('#result-replay').click();const retry=f.releases.at(-1);f.c.FQ.app.home();retry();
  assert.equal(f.spoken.length,1);
});

test('나라 이름 듣기도 재생 실패를 버튼에 안내하고 설명 재청취가 앞선 이름 대기를 취소',()=>{
  const f=fixture(),a=f.startVoice(['kr']);a.submit({code:'kr'});
  const target=f.node('name-audio');target.textContent='🔊';target.setAttribute('data-speak','대한민국');
  f.clickDelegated('[data-speak]',target);const name=f.releases.at(-1);
  f.node('#replay').click();name();assert.equal(f.spoken.length,0);
  f.releases.at(-1)();assert.equal(f.spoken.length,1);
  f.clickDelegated('[data-speak]',target);f.releases.at(-1)();
  assert.deepEqual(f.spoken.at(-1),['대한민국']);
  assert.equal(typeof f.playbackFailures.at(-1),'function');f.playbackFailures.at(-1)();
  assert.match(target.textContent,/다시/);
});

test('나라 이름 듣기를 예약한 뒤 답을 고르면 이전 이름 요청보다 새 정답 설명을 우선',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital'});f.c.FQ.app.startGame(['kr']);
  const target=f.node('name-audio');target.setAttribute('data-speak','대한민국');
  f.clickDelegated('[data-speak]',target);const name=f.releases.at(-1);
  f.c.FQ.test.submit({code:'kr'});name();assert.equal(f.spoken.length,0);
  f.releases.at(-1)();f.runDelay(180);
  assert.equal(f.spoken.length,1);assert.equal(f.spoken[0][1],'서울');
});

test('오답과 건너뛰기는 이름 한 번과 국기 특징 하나만 다정하게 알려 준다',()=>{
  for(const mode of ['choice4','reverse','voice','typing'])for(const gaveUp of [false,true]){
    const f=fixture();f.c.FQ.storage.updateSettings({mode});f.c.FQ.app.startGame(['kr']);
    const a=f.c.FQ.test,c=f.c.FQ.quiz.byCode('kr'),sounds=[];f.c.FQ.audio.play=name=>sounds.push(name);
    a.submit({code:'jp',text:'일본'},gaveUp);
    assert.deepEqual([...a.state.lastSpeech.lines],[c.ko,c.flagHint]);
    assert.equal(sounds.includes('wrong'),false);
    const html=f.node('#feedback-area').innerHTML;
    assert.match(html,/함께 알아봐요/);assert.match(html,/feedback learn/);
    assert.doesNotMatch(html,/아쉬워요|같이 외워|다음엔 맞힐|대한민국 · 대한민국|고른 나라는|fact-box|info-list|ename/);
  }
});

test('수도 오답도 수도를 한 번만 말하고 어느 나라의 수도인지 짧게 설명한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital'});f.c.FQ.app.startGame(['kr']);
  const a=f.c.FQ.test;a.submit({code:'jp'});
  assert.deepEqual([...a.state.lastSpeech.lines],['서울','대한민국의 수도예요']);
  f.releases.at(-1)();f.runDelay(120);
  assert.deepEqual(f.spoken,[['서울','대한민국의 수도예요']]);
  f.node('#replay').click();f.releases.at(-1)();
  assert.deepEqual(f.spoken.at(-1),['서울','대한민국의 수도예요']);
});

test('정답이 적어도 결과에서는 다시 잘해야 한다는 부담 없이 응원한다',()=>{
  const f=fixture(),a=f.startVoice(['kr']);a.submit({text:''},true);a.goNext();
  f.releases.at(-1)();
  assert.deepEqual(f.spoken,[['멋져!']]);
  assert.doesNotMatch(f.node('main').innerHTML,/조금만 더 하면|다시 해 보면 훨씬/);
});

console.log('앱 흐름 회귀 검사 '+passed+'건 통과');
