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
  const delegated = [], playbackFailures = [], modals = [], voiceOptions = [], music = [];
  let currentMusic = null;
  let timerId = 0;
  function node(sel) {
    if (!nodes.has(sel)) {
      const classes = new Set();
      nodes.set(sel, {
        value: '', checked: false, disabled: false, textContent: '', style: {}, dataset: {}, tagName: 'BUTTON', attrs: {}, handlers: {}, renderCount: 0,
        classList: {add:(c)=>classes.add(c), remove:(c)=>classes.delete(c), toggle(c,force){const add=force===undefined?!classes.has(c):force;if(add)classes.add(c);else classes.delete(c);return add;}, contains:(c)=>classes.has(c)},
        addEventListener(type, fn){this.handlers[type] = fn;},
        click(){if (!this.disabled) this.handlers.click?.({target:this});},
        setAttribute(k,v){this.attrs[k]=String(v);}, getAttribute(k){return this.attrs[k]??'';}, removeAttribute(k){delete this.attrs[k];},
        querySelector: node, querySelectorAll:()=>[], appendChild(){}, remove(){}, focus(options){this.focusOptions=options;c.document.activeElement=this;}, scrollIntoView(options){this.scrollOptions=options;},
        set innerHTML(html){
          this.html=html;this.renderCount++;
          for (const m of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
            const el=node('#'+m[2]);
            el.tagName=m[1].toUpperCase();
            el.disabled=/\sdisabled(?:[\s>]|$)/.test(m[0]);
            el.checked=/\schecked(?:[\s>]|$)/.test(m[0]);
            el.hidden=/\shidden(?:[\s>]|$)/.test(m[0]);
            for(const attr of m[0].matchAll(/([\w-]+)="([^"]*)"/g))el.setAttribute(attr[1],attr[2]);
            if(el.tagName==='INPUT')el.value=el.attrs.value||'';
          }
          for(const select of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
            const choices=[...select[2].matchAll(/<option\b[^>]*value="([^"]+)"[^>]*>/g)];
            node('#'+select[1]).value=(choices.find(choice=>/\sselected(?:[\s>]|$)/.test(choice[0]))||choices[0])?.[1]||'';
          }
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
    document:{hidden:false,readyState:'loading',addEventListener(type,fn){(events[type]??=[]).push(fn);},querySelector:sel=>sel==='.app'?node('.app'):null,body:node('body'),createElement:()=>node('created'),getElementById:(id)=>node('#'+id)},
    navigator:{}, location:{protocol:'http:',hostname:'localhost'},confirm:()=>true,
    addEventListener(type,fn){(events[type]??=[]).push(fn);},
    requestAnimationFrame(){},cancelAnimationFrame(){},matchMedia:()=>({matches:false}),scrollY:0,scrollTo(opts){c.scrollY=opts.top||0;},
    FQ:{ui:{$:node,$$:()=>[],esc:String,setMain(html){node('main').innerHTML=html;c.scrollTo({top:0});node('main').focus();return node('main');},
      on(root,selector,event,fn){delegated.push({selector,event,fn});},countryModal(country){modals.push(country);},flagSrc:code=>'flags/'+code+'.svg'},
      audio:{setEnabled(){},setSpeakEnabled(){},unlock(){},stopSpeaking(){},play(){},
        say(lines,opts,onFail){spoken.push([...lines]);playbackFailures.push(onFail);voiceOptions.push(opts);}},
      music:{setEnabled(){},setBgmEnabled(){},unlock(){},stop(){if(currentMusic)currentMusic.cancelled=true;currentMusic=null;},
        play(event,opts={}){if(currentMusic)currentMusic.cancelled=true;const item={event,opts,cancelled:false};music.push(item);currentMusic=item;return ()=>{item.cancelled=true;};}},
      effects:{celebrate:()=> '정답',burst(){}},badges:{check:()=>[]},screens:{dex(){},stats(){}},
      speech:{unavailableReason:()=>null,blocked:()=>false,
        start(callbacks){c.callbacks=callbacks;c.listening=true;return true;},
        abort(){c.listening=false;},stopAnd(cb){c.listening=false;releases.push(cb);},isListening:()=>!!c.listening}
    }};
  c.window=c;vm.createContext(c);
  const uiMock=c.FQ.ui;
  vm.runInContext(fs.readFileSync(path.join(root,'js/ui.js'),'utf8'),c,{filename:'js/ui.js'});
  Object.assign(c.FQ.ui,uiMock);
  for(const file of ['js/util.js','js/storage.js','js/features.js','data/countries.js', 'data/subjects.js', 'data/confusion-groups.js','data/map-coords.js','data/map-shapes.js','js/map.js','js/progress.js','js/quiz.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c,{filename:file});
  // 제품 코드에는 테스트 전용 진입점을 추가하지 않고 VM 안에서만 내부 상태를 노출한다.
  const source=fs.readFileSync(path.join(root,'js/app.js'),'utf8').replace('FQ.app = { home:',
    'FQ.test = {state:state,startListening:startListening,submit:submit,goNext:goNext,toggleMic:toggleMic};\n  FQ.app = { home:');
  vm.runInContext(source,c,{filename:'js/app.js'});
  // 깜짝 상자 난수는 기본으로 고정한다(굴림 0.99 → 8장째 보장 전에는 안 열림, 종류 보통). 상자를 보려는 검사만 덮어쓴다.
  c.FQ.test.state.rng=()=>0.99;c.FQ.test.state.rngKind=()=>0.5;
  function runDelay(delay){for(const [id,t] of [...timers])if(t.delay===delay){if(!t.interval)timers.delete(id);t.fn();}}
  function startVoice(only=['id','in']){
    c.FQ.storage.updateSettings({mode:'voice'});
    c.FQ.app.startGame(only);
    return c.FQ.test;
  }
  function clickDelegated(selector,target){delegated.filter(item=>item.selector===selector&&item.event==='click').at(-1).fn({target},target);}
  function finishMusic(failed=false){const item=currentMusic;if(!item||item.cancelled)return;currentMusic=null;(failed?item.opts.onFail:item.opts.onDone)?.();}
  function finishVoice(){voiceOptions.at(-1)?.onEnd?.();}
  return {c,node,nodes,events,spoken,releases,timers,runDelay,startVoice,clickDelegated,playbackFailures,modals,music,finishMusic,finishVoice};
}

let passed=0;
function test(name,fn){fn();passed++;console.log('✓ '+name);}
const rx=(s)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

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

test('정답도 쉬운 특징 한 문장과 다시 듣기를 제공',()=>{
  const f=fixture(),a=f.startVoice(['id']);
  a.submit({code:'id'});
  assert.deepEqual([...a.state.lastSpeech.lines],['인도네시아',f.c.FQ.quiz.byCode('id').flagHint]);
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
  a.submit({code:a.state.game.current().country.code});
  const pending=f.releases[0];
  f.c.FQ.app.home();pending();f.runDelay(180);
  assert.equal(f.spoken.length,0);assert.equal(a.state.game,null);
});

test('5연속 뒤 즉시 결과로 이동해도 보너스와 경험치가 먼저 기록됨',()=>{
  const f=fixture(),a=f.c.FQ.test;
  a.state.game=f.c.FQ.quiz.createGame({mode:'choice4',count:5});
  // 깜짝 상자는 검사용 난수로 다섯째 카드에서 보통 상자 하나만 연다.
  a.state.rng=()=>f.c.FQ.storage.chestState().since>=4?0:0.99;a.state.rngKind=()=>0.5;
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

test('음성 연결 오류 때 같은 문제를 즉시 국기 선택으로 이어 가고 늦은 인식 결과는 버린다',()=>{
  const f=fixture(),a=f.startVoice(['id']),q=a.state.game.current(),callbacks=f.c.callbacks;
  callbacks.error('network');callbacks.end();callbacks.result(['인도네시아']);
  assert.equal(a.state.game.current(),q);assert.equal(q.mode,'reverse');assert.equal(q.options.length,4);
  assert.equal(a.state.listenOn,false);assert.equal(a.state.listenTimer,null);assert.equal(a.state.answered,false);
  assert.doesNotMatch(f.node('main').innerHTML,/id="mic"|글자로 답하기/);
  assert.equal(f.c.FQ.storage.settings().mode,'voice');assert.equal(f.c.FQ.storage.stats().asked,0);
  f.releases.at(-1)();assert.deepEqual(f.spoken.at(-1),['인도네시아']);
  a.submit({code:'id'});assert.equal(f.c.FQ.storage.countryStat('id').correct,1);
});

test('오프라인에서 두 말하기 놀이를 시작하면 마이크 없이 이름 듣고 국기를 고른다',()=>{
  for(const [mode,fallback] of [['voice','reverse'],['capitalVoice','capital']]) {
    const f=fixture();f.c.navigator.onLine=false;f.c.FQ.storage.updateSettings({mode});f.c.FQ.app.startGame(['kr']);
    const a=f.c.FQ.test,q=a.state.game.current();
    assert.equal(q.mode,fallback);assert.equal(q.country.code,'kr');assert.equal(q.options.length,4);
    assert.ok(!f.c.listening);assert.doesNotMatch(f.node('main').innerHTML,/id="mic"/);
    f.releases.at(-1)();assert.deepEqual(f.spoken.at(-1),[mode==='voice'?'대한민국':'서울']);
    a.submit({code:'kr'});
    const record=mode==='voice'?f.c.FQ.storage.countryStat('kr'):f.c.FQ.storage.axisStat('capital','kr');
    assert.equal(record.correct,1);assert.equal(f.c.FQ.storage.settings().mode,mode);
  }
});

test('풀이 중 연결이 끊겨도 차례·점수·문제·힌트·남은 시간을 유지한다',()=>{
  const f=fixture();f.c.FQ.app.boot();f.c.FQ.storage.updateSettings({timer:10});
  const a=f.startVoice(['kr','jp']),g=a.state.game;
  a.submit({code:g.current().country.code});a.goNext();
  const q=g.current(),asked=f.c.FQ.storage.stats().asked;
  f.runDelay(1000);f.runDelay(1000);f.node('#hint').click();
  const hint=f.node('#hint-area').innerHTML;
  f.c.navigator.onLine=false;f.events.offline[0]();
  assert.equal(a.state.game,g);assert.equal(g.current(),q);assert.equal(g.index,1);assert.equal(g.correct,1);
  assert.equal(a.state.usedHint,true);assert.equal(f.node('#hint-area').innerHTML,hint);assert.equal(a.state.timeLeft,8);
  assert.equal(f.c.FQ.storage.stats().asked,asked);assert.equal(f.c.listening,false);
});

test('연결이 돌아와도 풀던 선택 문제는 유지하고 다음 문제에서 말하기를 다시 연다',()=>{
  const f=fixture();f.c.FQ.app.boot();f.c.navigator.onLine=false;
  const a=f.startVoice(['kr','jp']),q=a.state.game.current();
  f.c.navigator.onLine=true;f.events.online[0]();
  assert.equal(a.state.game.current(),q);assert.equal(q.mode,'reverse');assert.ok(!f.c.listening);
  a.submit({code:q.country.code});a.goNext();
  assert.equal(a.state.game.current().mode,'voice');assert.equal(f.c.listening,true);
});

test('수도 힌트를 들은 뒤 오프라인으로 바뀌어도 답 공개 기록을 유지한다',()=>{
  const f=fixture();f.c.FQ.app.boot();f.c.FQ.storage.updateSettings({mode:'capitalVoice'});f.c.FQ.app.startGame(['kr']);
  f.node('#hint').click();f.c.navigator.onLine=false;f.events.offline[0]();
  const a=f.c.FQ.test;assert.equal(a.state.revealed,true);assert.equal(a.state.game.current().mode,'capital');
  a.submit({code:'kr'});
  assert.equal(f.c.FQ.storage.axisStat('capital','kr').seen,1);assert.equal(f.c.FQ.storage.axisStat('capital','kr').correct,0);
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
  assert.deepEqual(f.spoken,[['멋져!']]);
});

test('결과 자동 응원 대기 중 다시 듣기를 눌러도 최신 요청만 재생하고 실패를 안내',()=>{
  const f=fixture(),a=f.startVoice(['kr']);a.submit({code:'kr'});a.goNext();
  const auto=f.releases.at(-1);f.node('#result-replay').click();const replay=f.releases.at(-1);
  auto();assert.equal(f.spoken.length,0);
  replay();assert.deepEqual(f.spoken,[['멋져!']]);
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
  f.releases.at(-1)();f.runDelay(180);f.finishMusic();
  assert.equal(f.spoken.length,1);assert.equal(f.spoken[0][0],'서울');
});

test('오답과 건너뛰기는 이름 한 번과 국기 특징 하나만 다정하게 알려 준다',()=>{
  for(const mode of ['choice4','reverse','voice','typing'])for(const gaveUp of [false,true]){
    const f=fixture();f.c.FQ.storage.updateSettings({mode});f.c.FQ.app.startGame(['kr']);
    const a=f.c.FQ.test,c=f.c.FQ.quiz.byCode('kr'),sounds=[];f.c.FQ.audio.play=name=>sounds.push(name);
    a.submit({code:'jp',text:'일본'},gaveUp);
    assert.deepEqual([...a.state.lastSpeech.lines],[c.ko,c.flagHint]);
    assert.equal(sounds.includes('wrong'),false);
    const html=f.node('#feedback-area').innerHTML;
    assert.match(html,/여행책에 한 장|지도에 톡|하나 더 만났어요|깃발이 살랑/);assert.match(html,/feedback learn/);
    assert.doesNotMatch(html,/아쉬워요|같이 외워|다음엔 맞힐|대한민국 · 대한민국|고른 나라는|fact-box|info-list|ename/);
  }
});

test('수도 오답도 수도를 한 번만 말하고 어느 나라의 수도인지 짧게 설명한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital'});f.c.FQ.app.startGame(['kr']);
  const a=f.c.FQ.test;a.submit({code:'jp'});
  assert.deepEqual([...a.state.lastSpeech.lines],['서울','대한민국의 수도예요']);
  f.releases.at(-1)();f.runDelay(120);f.finishMusic();
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

test('오답·건너뛰기·시간 초과도 한 장씩 쌓이고 깜짝 상자는 굴린 대로 열린다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'choice4',count:5,speak:false,timer:10});
  f.c.FQ.app.startGame(null);const a=f.c.FQ.test;
  // 검사용 난수: 다섯째 카드에서만 열리고(보통 상자) 그 전에는 열리지 않는다.
  a.state.rng=()=>f.c.FQ.storage.chestState().since>=4?0:0.99;a.state.rngKind=()=>0.5;
  for(let i=0;i<5;i++){
    if(i===2){f.node('#answer-input').value='';for(let n=0;n<10;n++)f.runDelay(1000);}
    else a.submit({text:''},i%2===0);
    a.submit({code:a.state.game.current().country.code}); // 중복 제출로 장수가 늘지 않는다.
    f.releases.at(-1)();
    assert.equal(f.c.FQ.storage.stats().asked,i+1);
    if(i<4){assert.equal(f.music.at(-1).event,'discovery');a.goNext();}
  }
  assert.equal(a.state.game.correct,0);assert.equal(a.state.game.bestStreak,0);
  assert.equal(a.state.game.wrong.length,5);assert.equal(a.state.game.bonusScore,5);
  assert.equal(a.state.xpGained,20);assert.equal(f.music.at(-1).event,'chest');
  assert.match(f.node('created').innerHTML,/그림 선물을 받았어요!/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.c.FQ.storage.chestState())),{since:0,opened:1,kinds:{plain:1}});
});

test('상자 진도는 다른 답이나 새 게임으로 줄지 않고 기록은 사실대로 남는다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'choice4',count:5});f.c.FQ.app.startGame(null);
  const a=f.c.FQ.test;
  a.submit({code:a.state.game.current().country.code});a.goNext();a.submit({text:''},true);
  assert.equal(f.c.FQ.storage.stats().asked,2);assert.equal(f.c.FQ.storage.stats().correct,1);
  assert.equal(a.state.game.streak,0);assert.match(f.node('#combo-title').textContent,/2 \/ 5장/);
  f.c.FQ.app.home();f.c.FQ.app.startGame(null);
  assert.match(f.node('main').innerHTML,/여행 카드 2 \/ 5장/);
});

test('채점 엔진도 같은 문제 중복 제출을 무시하고 같이 보기는 감점하지 않는다',()=>{
  const f=fixture(),g=f.c.FQ.quiz.createGame({mode:'choice4',count:5});
  const first=g.current().country.code;
  const res=g.submit({code:first},true);assert.equal(res.gained,10);
  assert.equal(g.submit({code:first}),null);assert.equal(g.hintsUsed,1);
  assert.equal(f.c.FQ.storage.stats().asked,1);assert.equal(g.playerScores[0].asked,1);
});

test('발견음은 마이크 해제 뒤 시작하고 실제 종료 뒤에만 Sua가 시작한다',()=>{
  const f=fixture(),a=f.startVoice(['kr']);a.submit({text:''},true);
  assert.equal(f.music.length,0);assert.equal(f.spoken.length,0);
  f.releases.at(-1)();assert.equal(f.music.at(-1).event,'discovery');assert.equal(f.spoken.length,0);
  assert.equal(f.node('#next').disabled,false);
  f.finishMusic();assert.deepEqual(f.spoken,[['대한민국',f.c.FQ.quiz.byCode('kr').flagHint]]);
});

test('음원 실패는 설명으로 이어지고 다음 문제는 늦게 끝나는 음악 콜백을 버린다',()=>{
  const f=fixture(),a=f.startVoice(['kr','jp']);a.submit({text:''},true);f.releases.at(-1)();
  f.finishMusic(true);assert.equal(f.spoken.length,1);
  a.goNext();a.submit({text:''},true);f.releases.at(-1)();const late=f.music.at(-1).opts.onDone;
  a.goNext();late();assert.equal(f.spoken.length,1);
});

test('상자는 Sua 설명 완료 후 한 번만 열리고 다시 듣기로 추가 적립하지 않는다',()=>{
  const f=fixture();for(let i=0;i<4;i++){f.c.FQ.storage.recordAnswer('jp',false);f.c.FQ.storage.recordChest(null);}
  const a=f.startVoice(['kr']);a.state.rng=()=>0;a.state.rngKind=()=>0.5;a.submit({text:''},true);f.releases.at(-1)();
  assert.equal(f.music.length,0);assert.equal(f.spoken.length,1);assert.equal(f.node('#next').disabled,false);
  f.finishVoice();assert.equal(f.music.at(-1).event,'chest');assert.equal(f.node('#next').disabled,true);
  f.finishVoice();assert.equal(f.music.filter(x=>x.event==='chest').length,1);
  f.node('created').handlers.click({target:{closest:()=>true}});
  assert.equal(f.node('#next').disabled,false);
  f.node('#replay').click();f.releases.at(-1)();f.finishVoice();
  assert.equal(f.music.filter(x=>x.event==='chest').length,1);assert.equal(f.c.FQ.storage.stats().asked,5);
  assert.equal(a.state.game.bonusScore,5);
});

test('상자를 기다리던 설명 실패도 상자를 보여 주고 숨기면 소리와 잠금이 남지 않는다',()=>{
  const f=fixture();f.c.FQ.app.boot();for(let i=0;i<4;i++){f.c.FQ.storage.recordAnswer('jp',false);f.c.FQ.storage.recordChest(null);}
  const a=f.startVoice(['kr']);a.state.rng=()=>0;a.state.rngKind=()=>0.5;a.submit({text:''},true);f.releases.at(-1)();f.playbackFailures.at(-1)();
  assert.equal(f.music.at(-1).event,'chest');
  f.c.document.hidden=true;f.events.visibilitychange[0]();
  assert.equal(f.music.at(-1).cancelled,true);assert.equal(f.node('#next').disabled,false);
});

test('겹친 보상은 상자, 단계, 스티커 순으로 한 음악만 고른다',()=>{
  const f=fixture();f.c.FQ.storage.addXp(295);f.c.FQ.storage.updateSettings({mode:'choice4'});f.c.FQ.app.startGame(['kr']);const a=f.c.FQ.test;
  a.submit({code:'kr'});f.releases.at(-1)();assert.equal(f.music.at(-1).event,'level');
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'choice4'});g.c.FQ.app.startGame(['kr']);const b=g.c.FQ.test;b.submit({code:'kr'});g.releases.at(-1)();
  assert.equal(g.music.at(-1).event,'sticker');
  const h=fixture();for(let i=0;i<4;i++){h.c.FQ.storage.recordAnswer('jp',false);h.c.FQ.storage.recordChest(null);}
  h.c.FQ.storage.addXp(295);const c=h.startVoice(['kr']);c.state.rng=()=>0;c.state.rngKind=()=>0.5;c.submit({code:'kr'});h.releases.at(-1)();
  assert.equal(h.music.length,0);h.finishVoice();assert.equal(h.music.at(-1).event,'chest');
});

test('정답 전용 음악과 홈 배경음은 기본 꺼짐이며 선택하면 사용할 수 있다',()=>{
  const f=fixture();assert.equal(f.c.FQ.storage.settings().correctMusic,false);assert.equal(f.c.FQ.storage.settings().homeMusic,false);
  f.c.FQ.storage.recordAnswer('kr',true);f.c.FQ.storage.updateSettings({mode:'choice4'});f.c.FQ.app.startGame(['kr']);const a=f.c.FQ.test;a.submit({code:'kr'});f.releases.at(-1)();
  assert.equal(f.music.at(-1).event,'discovery');
  f.c.FQ.storage.updateSettings({correctMusic:true});f.c.FQ.app.startGame(['kr']);a.submit({code:'kr'});f.releases.at(-1)();
  assert.equal(f.music.at(-1).event,'correct');
  f.c.FQ.storage.updateSettings({homeMusic:true});f.c.FQ.app.home();f.releases.at(-1)();assert.equal(f.music.at(-1).event,'homeBgm');
  const bgm=f.music.at(-1);
  f.c.FQ.app.startGame(['kr']);assert.equal(bgm.cancelled,true);
});

test('결과는 정확도와 관계없이 응원을 마친 뒤 같은 완료 음악을 재생한다',()=>{
  for(const correct of [true,false]){
    const f=fixture(),a=f.startVoice(['kr']);a.submit(correct?{code:'kr'}:{text:''},!correct);a.goNext();
    f.releases.at(-1)();assert.deepEqual(f.spoken,[['멋져!']]);assert.equal(f.music.length,0);
    f.finishVoice();assert.equal(f.music.at(-1).event,'finish');
    assert.match(f.node('main').innerHTML,/오늘 만난 나라 1개/);assert.match(f.node('main').innerHTML,/학습 기록 보기/);
    assert.equal(a.state.lastSummary.correct,correct?1:0);
  }
});

test('홈과 도감 배경음도 실제 마이크 종료 신호 뒤에만 시작한다',()=>{
  for(const screen of ['home','dex']){
    const f=fixture(),recognizers=[];
    f.c.SpeechRecognition=class {constructor(){recognizers.push(this);}start(){}abort(){this.aborted=true;}stop(){}};
    vm.runInContext(fs.readFileSync(path.join(root,'js/speech.js'),'utf8'),f.c,{filename:'js/speech.js'});
    f.c.FQ.screens.dex=()=>f.c.FQ.app.musicScreen('dex');
    f.c.FQ.app.boot();f.c.FQ.storage.updateSettings({homeMusic:true});f.startVoice(['kr']);
    const mic=recognizers[0];mic.onstart();
    if(screen==='home')f.c.FQ.app.home();else f.node('#nav-dex').click();
    assert.equal(mic.aborted,true);assert.equal(f.music.length,0);
    mic.onend();assert.equal(f.music.length,0);f.runDelay(60);
    assert.equal(f.music.length,1);assert.equal(f.music[0].event,'homeBgm');
  }
});

test('배경음 해제 대기는 화면·설정·숨김 변경으로 취소한다',()=>{
  for(const action of ['quiz','stats','off','mute','hidden','modal']){
    const f=fixture();f.c.FQ.app.boot();f.c.FQ.storage.updateSettings({homeMusic:true});f.startVoice(['kr']);
    f.c.FQ.app.home();const pending=f.releases.at(-1);
    if(action==='quiz')f.c.FQ.app.startGame(['kr']);
    if(action==='stats')f.c.FQ.app.musicScreen('stats');
    if(action==='off'){f.c.FQ.storage.updateSettings({homeMusic:false});f.c.FQ.app.musicScreen('home');}
    if(action==='mute')f.c.FQ.storage.updateSettings({sound:false});
    if(action==='hidden'){f.c.document.hidden=true;f.events.visibilitychange[0]();}
    if(action==='modal')f.c.document.querySelector=selector=>selector==='.modal-back'?{}:null;
    pending();assert.equal(f.music.filter(x=>x.event==='homeBgm').length,0,action);
  }
});

test('같은 홈에서 배경음 설정을 바꿔도 최신 해제 요청만 재생한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({homeMusic:true});f.c.FQ.app.home();const first=f.releases.at(-1);
  f.c.FQ.storage.updateSettings({homeMusic:false});f.c.FQ.app.musicScreen('home');
  f.c.FQ.storage.updateSettings({homeMusic:true});f.c.FQ.app.musicScreen('home');const latest=f.releases.at(-1);
  first();assert.equal(f.music.length,0);latest();assert.equal(f.music.length,1);
});

test('지도 핀 제출은 지도 기록만 쌓고 기존 국기 스티커와 오늘의 도전을 바꾸지 않는다',()=>{
  for(const correct of [true,false]) {
    const f=fixture();f.c.FQ.storage.updateSettings({mode:'map'});
    const before=JSON.stringify(f.c.FQ.storage.daily());
    f.c.FQ.app.startGame(['kr']);const a=f.c.FQ.test,q=a.state.game.current();
    assert.match(f.node('main').innerHTML,/이 나라는 어디에 있을까요/);
    assert.equal((f.node('main').innerHTML.match(/class="map-pin answer-btn"/g)||[]).length,4);
    const code=correct?'kr':q.options.find(c=>c.code!=='kr').code;
    a.submit({code});a.submit({code});
    assert.equal(f.c.FQ.storage.axisStat('map','kr').seen,1);
    assert.equal(f.c.FQ.storage.axisStat('map','kr').correct,correct?1:0);
    assert.equal(f.c.FQ.storage.countryStat('kr').seen,0);
    assert.equal(a.state.newStickers.length,0);
    assert.equal(JSON.stringify(f.c.FQ.storage.daily()),before);
    f.releases.at(-1)();f.finishMusic();
    assert.deepEqual(f.spoken.at(-1),[q.country.ko,q.country.fact]);
  }
});

test('그림 모드는 스위치가 꺼지면 저장된 선택도 국기 모드로 돌아간다',()=>{
  for(const mode of ['symbol','place','unknown']) {
    const f=fixture();f.c.FQ.storage.updateSettings({mode,dev:{art:false}});f.c.FQ.app.home();
    assert.equal(f.c.FQ.storage.settings().mode,'choice4');
    assert.doesNotMatch(f.node('main').innerHTML,/data-mode="(?:symbol|place)"/);
    f.c.FQ.storage.updateSettings({mode});f.c.FQ.app.startGame(['kr']);
    assert.equal(f.c.FQ.test.state.game.current().mode,'choice4');
  }
});

test('두 그림 퀴즈는 실제 그림 경로·4개 보기·별도 기록·기존 fact 음원을 사용한다',()=>{
  for(const mode of ['symbol','place']) {
    const f=fixture();f.c.FQ.storage.updateSettings({mode,dev:{art:true}});f.c.FQ.app.home();
    tapPlay(f,'art');assert.match(f.node('main').innerHTML,new RegExp('data-mode="'+mode+'"'));
    f.c.FQ.app.startGame(['kr']);const a=f.c.FQ.test,q=a.state.game.current();
    assert.match(f.node('main').innerHTML,new RegExp('images/'+(mode==='place'?'places':'symbols')+'/kr.webp'));
    assert.equal((f.node('main').innerHTML.match(/class="answer-btn art-choice"/g)||[]).length,4);
    const artName=f.c.FQ.subjects.kr[mode].ko;
    assert.match(f.node('main').innerHTML,new RegExp('data-speak="'+artName+'"'),'그림 문제에 그림 이름 들어보기 단추가 있어야 한다');
    f.node('#question-art').handlers.load();
    const before=JSON.stringify(f.c.FQ.storage.daily());
    a.submit({code:'kr'});f.releases.at(-1)();f.finishMusic();
    assert.equal(f.c.FQ.storage.axisStat(mode,'kr').correct,1);
    assert.equal(f.c.FQ.storage.countryStat('kr').correct,0);
    assert.equal(JSON.stringify(f.c.FQ.storage.daily()),before);
    assert.equal(a.state.newStickers.length,0);
    assert.deepEqual(f.spoken.at(-1),[q.country.ko,artName,q.country.fact]);
  }
});

test('그림·명소 퀴즈는 처음 만나는 나라에서도 소개 카드 없이 바로 문제를 낸다',()=>{
  for(const mode of ['symbol','place']) {
    const f=fixture();f.c.FQ.storage.updateSettings({mode,timer:10,dev:{art:true}});f.c.FQ.app.startGame(['kr']);
    const a=f.c.FQ.test,html=f.node('main').innerHTML;
    assert.doesNotMatch(html,/meet-next|meet-card|meet-quiz/);
    assert.match(html,/id="answer-area"/);
    assert.equal((html.match(/class="answer-btn art-choice"/g)||[]).length,4);
    assert.equal(a.state.game.current().mode,mode);
    assert.equal(a.state.timerId,null);
    assert.equal(Object.keys(f.c.FQ.storage.allAxisStats(mode)).length,0,'문제를 보기만 해도 기록하지 않는다');
    f.node('#question-art').handlers.load();a.submit({code:'kr'});
    assert.equal(f.c.FQ.storage.axisStat(mode,'kr').seen,1);
  }
});

test('그림 다운로드 실패를 오답으로 기록하지 않고 다시 받은 뒤에만 제출한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  const a=f.c.FQ.test,img=f.node('#question-art');
  img.handlers.error();a.submit({code:'kr'});a.submit({text:''},true);
  assert.equal(f.c.FQ.storage.stats().asked,0);assert.equal(a.state.answered,false);
  f.node('#art-retry').click();assert.equal(img.src,'images/symbols/kr.webp');
  img.handlers.load();a.submit({code:'kr'});
  assert.equal(f.c.FQ.storage.axisStat('symbol','kr').seen,1);
});

test('그림을 오래 기다려도 큰 다음 그림 단추로 기록 없이 진행한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol'});f.c.FQ.app.startGame(['kr','jp']);
  const a=f.c.FQ.test,g=a.state.game,q=g.current(),lateLoad=f.node('#question-art').handlers.load;
  f.runDelay(8000);
  assert.equal(f.node('#art-error').hidden,false);assert.equal(f.node('#art-loading').hidden,true);
  assert.match(f.node('main').innerHTML,/id="art-next"[^>]*>⏭ 다음 그림/);
  f.node('#art-next').click();
  assert.notEqual(g.current(),q);assert.equal(g.index,1);assert.equal(a.state.unscored,1);
  assert.equal(f.c.FQ.storage.stats().asked,0);assert.equal(f.c.FQ.storage.axisStat('symbol',q.country.code).seen,0);
  lateLoad();assert.equal(a.state.artUnavailable,true,'앞 문제의 그림 응답이 다음 문제를 풀어 버리지 않는다');
});

test('느린 그림 다운로드 중에는 제출이 시작되지 않고, 새 축에는 제한 시간이 없다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',timer:10,dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  const a=f.c.FQ.test;
  // 그림을 기다리는 동안 채점·제한 시간은 시작되지 않는다. 다만 빠져나갈 길은 잠그지 않는다 —
  // 아이는 비행기 모드로 놀고, 그림이 끝내 안 오면 그 문제에 갇히기 때문이다.
  assert.equal(a.state.artUnavailable,true);assert.equal(f.node('#skip').disabled,false);
  for(let i=0;i<15;i++)f.runDelay(1000);
  a.submit({code:'kr'});a.submit({text:''},true);
  assert.equal(f.c.FQ.storage.stats().asked,0);assert.equal(a.state.answered,false);
  f.node('#question-art').handlers.load();
  assert.equal(a.state.artUnavailable,false);assert.equal(f.node('#skip').disabled,false);
  for(let i=0;i<10;i++)f.runDelay(1000);
  // 새 축에는 제한 시간이 없다(D23) — 그림이 와도 초시계가 돌지 않고, 10초가 지나도 문제는 그대로 남는다.
  assert.equal(a.state.timerId,null);assert.equal(a.state.timedOut,false);assert.equal(a.state.answered,false);
  assert.equal(f.c.FQ.storage.stats().asked,0);assert.equal(a.state.unscored,0);
  assert.doesNotMatch(f.node('main').innerHTML,/id="timer-chip"/);
});

test('숨긴 화면에서 그림이 도착해도 복귀 뒤 새 축의 초시계는 돌지 않는다',()=>{
  const f=fixture();f.c.FQ.app.boot();
  f.c.FQ.storage.updateSettings({mode:'symbol',timer:10,dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  const a=f.c.FQ.test;
  f.c.document.hidden=true;f.events.visibilitychange[0]();
  f.node('#question-art').handlers.load();
  for(let i=0;i<12;i++)f.runDelay(1000);
  assert.equal(a.state.timerId,null);assert.equal(a.state.answered,false);assert.equal(a.state.timedOut,false);
  assert.equal(f.c.FQ.storage.axisStat('symbol','kr').seen,0);
  f.c.document.hidden=false;f.events.visibilitychange[0]();
  assert.equal(a.state.timerId,null,'복귀해도 새 축에는 초시계가 없다');assert.equal(a.state.artUnavailable,false);
  for(let i=0;i<12;i++)f.runDelay(1000);
  assert.equal(a.state.answered,false);assert.equal(a.state.timedOut,false);
  assert.equal(f.c.FQ.storage.axisStat('symbol','kr').seen,0);assert.equal(a.state.unscored,0);
});

test('숨긴 동안 그림 오류가 나면 복귀해도 제한 시간을 재개하지 않고 재수신을 기다린다',()=>{
  const f=fixture();f.c.FQ.app.boot();
  f.c.FQ.storage.updateSettings({mode:'place',timer:10,dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  const a=f.c.FQ.test;
  f.node('#question-art').handlers.load();f.runDelay(1000);
  f.c.document.hidden=true;f.events.visibilitychange[0]();
  f.node('#question-art').handlers.error();
  f.c.document.hidden=false;f.events.visibilitychange[0]();
  for(let i=0;i<12;i++)f.runDelay(1000);
  assert.equal(a.state.artUnavailable,true);assert.equal(a.state.timerId,null);
  assert.equal(a.state.answered,false);assert.equal(a.state.timedOut,false);
  assert.equal(f.c.FQ.storage.axisStat('place','kr').seen,0);
  f.node('#art-retry').click();f.node('#question-art').handlers.load();
  assert.equal(a.state.artUnavailable,false);assert.equal(a.state.timerId,null,'새 축에는 제한 시간이 없다');
});

test('지도·그림·명소·수도 놀이에서는 오늘의 도전이 왜 안 오르는지 화면으로 알려 준다',()=>{
  for(const mode of ['map','symbol','place','capital']){
    const f=fixture();f.c.FQ.storage.updateSettings({mode,continent:'all',dev:{art:true}});
    f.c.FQ.app.home();
    assert.equal(f.c.FQ.storage.settings().mode,mode,mode);
    assert.match(f.node('main').innerHTML,/지금 놀이로는 칸이 안 올라가요 · 눌러서 국기 놀이로 바꾸기/,mode);
    // 새 안내는 화면 글자일 뿐이다. 읽어 주면 수아 음원에 없는 문구가 되어 배포가 막힌다.
    assert.equal(f.spoken.length,0,mode);
  }
  // 국기 놀이에서는 안내가 뜨지 않고, 대륙만 어긋났을 때의 기존 안내도 그대로다.
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'voice',continent:'all'});g.c.FQ.app.home();
  assert.doesNotMatch(g.node('main').innerHTML,/daily-why/);
  const h=fixture(),other=h.c.FQ.progress.daily().continent==='아시아'?'유럽':'아시아';
  h.c.FQ.storage.updateSettings({mode:'voice',continent:other});h.c.FQ.app.home();
  assert.match(h.node('main').innerHTML,new RegExp('지금은 '+other+'만 나와서 오르지 않아요'));
});

test('오늘의 도전은 국기 축 놀이를 그대로 두고 축이 다른 놀이만 국기 놀이로 되돌린다',()=>{
  for(const mode of ['voice','typing','reverse']){
    const f=fixture();f.c.FQ.storage.updateSettings({mode,continent:'아프리카'});f.c.FQ.app.home();
    f.node('#daily-go').click();
    assert.equal(f.c.FQ.storage.settings().mode,mode,mode);
    assert.equal(f.c.FQ.storage.settings().continent,f.c.FQ.progress.daily().continent,mode);
  }
  // 수도는 2026-09-17 부터 capital 축이라 오늘의 도전이 오르지 않는다 — 지도·그림처럼 국기 놀이로 되돌린다.
  for(const mode of ['map','symbol','place','capital']){
    const f=fixture();f.c.FQ.storage.updateSettings({mode,dev:{art:true}});f.c.FQ.app.home();
    f.node('#daily-go').click();
    assert.equal(f.c.FQ.storage.settings().mode,'choice4',mode);
    // 안내대로 눌렀으면 다음 화면에서는 안내가 사라져 있어야 한다.
    assert.doesNotMatch(f.node('main').innerHTML,/daily-why/,mode);
  }
});

test('한 번 더 만나기도 골라 둔 국기 놀이를 유지하고 축이 다를 때만 되돌린다',()=>{
  const f=fixture();f.c.FQ.storage.recordAnswer('jp',false);
  f.c.FQ.storage.updateSettings({mode:'typing'});f.c.FQ.app.home();tapPlay(f,'flag');
  f.node('#review').click();
  assert.equal(f.c.FQ.storage.settings().mode,'typing');
  assert.equal(f.c.FQ.test.state.game.current().mode,'typing');

  const g=fixture();g.c.FQ.storage.recordAnswer('jp',false);
  g.c.FQ.storage.updateSettings({mode:'map'});g.c.FQ.app.home();tapPlay(g,'flag');
  g.node('#review').click();
  assert.equal(g.c.FQ.storage.settings().mode,'choice4');
  assert.equal(g.c.FQ.test.state.game.current().mode,'choice4');
});


test('그림을 끝내 못 받아도 아이는 그 문제에서 빠져나갈 수 있다',()=>{
  // 비행기 모드에서는 '다시 불러오기'가 영원히 실패한다. 빠져나갈 길까지 잠그면
  // 아이가 그 문제에 갇혀 놀이를 끝낼 수 없다.
  const f=fixture();
  f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});
  f.c.FQ.app.startGame(['kr','jp','fr']);
  const a=f.c.FQ.test;
  f.node('#question-art').handlers.error();
  assert.equal(a.state.artUnavailable,true);
  assert.equal(f.node('#skip').disabled,false,'모르겠어요가 잠겼다 — 아이가 갇힌다');
  assert.equal(f.node('#hint').disabled,false,'같이 보기가 잠겼다');
  const first=a.state.game.current().country.code;
  f.node('#skip').click();
  assert.notEqual(a.state.game.current().country.code,first,'건너뛰기를 눌러도 다음 문제로 안 간다');
  // 못 받은 그림을 오답으로 기록하지 않는다 — 아이가 안 틀린 것을 틀렸다고 배우면 안 된다.
  assert.equal(f.c.FQ.storage.stats().asked,0,'그림 실패가 기록에 남았다');
  assert.equal(f.c.FQ.storage.wrongList().length,0);
  assert.equal(a.state.game.wrong.length,0);
});

test('옛 js/ui.js 가 캐시에 섞여도 그림 문제가 죽지 않는다',()=>{
  // 지금 공개된 판(704be52)의 ui.js 에는 artFor 도 artAlt 도 없다. 배포가 바뀌는 잠깐 사이에
  // 새 app.js 와 옛 ui.js 가 함께 굳으면, 폴백이 없을 때 renderQuiz 가 통째로 터져
  // 아이가 시작을 눌러도 아무 일이 안 나는 '멈춘 화면'이 된다. 비행기 모드에서는 낫지도 않는다.
  for (const missing of [['artFor'],['artAlt'],['artFor','artAlt']]) {
    const f=fixture();
    for (const name of missing) delete f.c.FQ.ui[name];
    f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});
    assert.doesNotThrow(()=>f.c.FQ.app.startGame(['kr']), 'ui.' + missing.join('+') + ' 없이 죽는다');

    const a=f.c.FQ.test;
    assert.ok(a.state.game, '문제가 만들어지지 않았다');
    assert.match(f.node('main').innerHTML,/images\/symbols\/kr\.webp/,'그림 경로를 못 만든다');
    // 힌트·채점·피드백까지 끝까지 간다.
    f.node('#question-art').handlers.load();
    assert.doesNotThrow(()=>f.node('#hint').click());
    assert.doesNotThrow(()=>a.submit({code:'kr'}));
    assert.equal(f.c.FQ.storage.axisStat('symbol','kr').correct,1);
  }
});

/* ---- 2026-09-17 화면·놀이 흐름 교정 ---- */

/** 주제·방식 선택은 ui.on 위임이라 delegated 로 누른다. 가짜 요소에 data-* 만 실어 보낸다. */
function tapPlay(f,tile){const t=f.node('play:'+tile);t.setAttribute('data-play',tile);f.clickDelegated('[data-play]',t);}
function tapPill(f,mode){const t=f.node('pill:'+mode);t.setAttribute('data-mode',mode);f.clickDelegated('[data-mode]',t);if(mode==='symbol'||mode==='place')f.node('#art-quiz-start').click();}
function playOrder(html){return [...html.matchAll(/data-play="([a-z]+)"/g)].map(m=>m[1]);}
function modeOrder(html){return [...html.matchAll(/data-mode="([A-Za-z0-9]+)"/g)].map(m=>m[1]);}

test('홈은 고정 순서의 주제 네 개만 보여 주고 세부 방식과 설정은 다음 화면으로 나눈다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'choice4',dev:{art:true}});f.c.FQ.app.home();
  const html=f.node('main').innerHTML;
  assert.deepEqual(playOrder(html),['flag','art','map','capital']);
  assert.deepEqual(modeOrder(html),[]);
  for(const id of ['play-flag','play-art','play-map','play-capital'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(html,/id="p1"|id="duel"|dad-open|dad-panel|길게 눌러|data-level|data-count/);
  assert.match(html,/id="play-capital"[\s\S]*?공부하기 · 문제 풀기/);
  assert.match(html,/id="daily-go"/,'오늘의 도전은 보조 항목으로 유지한다');
  f.c.FQ.storage.updateSettings({mode:'place'});f.c.FQ.app.home();
  const html2=f.node('main').innerHTML;
  assert.deepEqual(playOrder(html2),['flag','art','map','capital']);assert.deepEqual(modeOrder(html2),[]);
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'map',dev:{art:false}});g.c.FQ.app.home();
  assert.deepEqual(playOrder(g.node('main').innerHTML),['flag','map','capital']);
  assert.doesNotMatch(g.node('main').innerHTML,/data-mode="symbol"|data-mode="place"|play-art/);
});

test('주제 선택 뒤 기존 아홉 퀴즈에 도달하고 최근 방식·저장된 출제 조건을 보존한다',()=>{
  const f=fixture(),a=f.c.FQ.test;f.c.FQ.storage.updateSettings({dev:{art:true},count:5,timer:10,continent:'아시아'});
  for(const [tile,modes] of [['flag',['choice4','reverse','voice','typing']],['art',['symbol','place']]]) {
    for(const mode of modes) {
      f.c.FQ.app.home();tapPlay(f,tile);
      assert.equal(a.state.game,null,'주제를 고르기만 하면 문제가 시작되지 않는다');
      assert.deepEqual(modeOrder(f.node('main').innerHTML),modes,'방식 순서는 최근 사용과 관계없이 고정한다');
      tapPill(f,mode);
      assert.equal(a.state.game.current().mode,mode);assert.equal(f.c.FQ.storage.settings().mode,mode);
      assert.equal(f.c.FQ.storage.settings().lastMode[tile],mode);
      assert.equal(a.state.game.total,5);assert.ok(a.state.game.questions.every(q=>q.country.continent==='아시아'));
      if(mode==='choice4')assert.ok(a.state.timerId,'국기 놀이의 저장된 제한 시간이 작동한다');
    }
  }
  f.c.FQ.app.home();tapPlay(f,'flag');
  assert.match(f.node('main').innerHTML.match(/<button[^>]*data-mode="typing"[^>]*>[\s\S]*?<\/button>/)[0],/최근에 한 놀이/,'최근 방식이 표시된다');
  f.c.FQ.app.home();tapPlay(f,'map');assert.equal(a.state.game,null);f.node('#map-quiz-start').click();assert.equal(a.state.game.current().mode,'map');
  for(const [button,mode] of [['#capital-choice-start','capital'],['#capital-voice-start','capitalVoice']]) {
    f.c.FQ.app.home();tapPlay(f,'capital');assert.equal(a.state.game,null);
    f.node(button).click();assert.equal(a.state.game.current().mode,mode);
    assert.doesNotMatch(f.node('main').innerHTML,/capital-study-card|meet-next/);
  }
  const g=fixture();g.c.FQ.storage.updateSettings({dev:{art:false}});g.c.FQ.app.home();
  tapPlay(g,'art');assert.equal(g.c.FQ.test.state.game,null,'꺼 둔 그림 주제는 시작되지 않는다');
});

test('설정은 한 번 탭으로 열리고 조건·이름·소리를 바꿔도 화면·포커스·기록을 보존한다',()=>{
  const f=fixture();f.c.FQ.app.boot();
  f.c.FQ.storage.recordAnswer('kr',true);f.c.FQ.storage.recordAnswer('jp',false,'capital');f.c.FQ.storage.addXp(23);
  const before=progressSnapshot(f);f.node('#nav-settings').click();
  assert.equal(f.c.FQ.test.state.screen,'settings');
  const main=f.node('main'),html=main.innerHTML,renders=main.renderCount;
  assert.doesNotMatch(html,/아빠 설정|길게 눌러|dad-panel/);
  for(const id of ['p1','duel','opt-sound','opt-speak','opt-bgm','opt-correct-music','opt-review','setting-level','setting-continent','setting-count','setting-timer'])assert.match(html,new RegExp('id="'+id+'"'),id);
  for(const [id,key,value,saved] of [
    ['setting-level','level','2','2'],['setting-continent','continent','유럽','유럽'],
    ['setting-count','count','all','all'],['setting-count','count','5',5],['setting-timer','timer','20',20]
  ]) {
    const control=f.node('#'+id);control.value=value;control.focus();f.c.scrollY=340;
    control.handlers.change({target:control});
    assert.equal(f.c.FQ.storage.settings()[key],saved,key);
    assert.equal(main.renderCount,renders,'선택마다 홈이나 설정 전체를 다시 그리지 않는다');
    assert.equal(f.c.document.activeElement,control,'키보드 포커스를 유지한다');
    assert.equal(control.value,value,'선택한 값을 유지한다');assert.equal(f.c.scrollY,340,'설정을 바꿀 때 스크롤 위치를 유지한다');
  }
  const name=f.node('#p1');name.value='새 이름';name.handlers.change({target:name});
  assert.equal(f.c.FQ.storage.settings().players[0],'새 이름');
  for(const [id,key] of [['opt-sound','sound'],['opt-speak','speak'],['opt-bgm','homeMusic'],['opt-correct-music','correctMusic'],['opt-review','reviewFirst']]) {
    const control=f.node('#'+id);control.checked=!f.c.FQ.storage.settings()[key];control.handlers.change({target:control});
    assert.equal(f.c.FQ.storage.settings()[key],control.checked,key);
  }
  assert.equal(main.renderCount,renders);assert.deepEqual(progressSnapshot(f),before,'설정 변경은 학습·보상 기록을 바꾸지 않는다');
  f.c.FQ.app.home();assert.equal(f.c.FQ.test.state.screen,'home');
  f.node('#nav-settings').click();assert.equal(f.node('#setting-continent').value,'유럽');assert.equal(f.node('#p1').value,'새 이름');
  assert.equal(JSON.stringify(f.c.FQ.storage.settings()).includes('dadOpen'),false);
});

test('설정 완료는 원래 주제로 돌아가고 오프라인 저장 노드는 화면 이동 중에도 유지한다',()=>{
  const f=fixture();f.c.FQ.app.boot();
  const progress=f.node('#offline-progress'),download=f.node('#offline-download'),extras=f.node('#settings-extras');
  progress.value=37;progress.max=100;const handler=()=>{};download.addEventListener('click',handler);
  assert.equal(extras.hidden,true);
  for(const tile of ['flag','art','capital']) {
    f.c.FQ.app.home();tapPlay(f,tile);
    const expected=tile==='capital'?'capital-menu':'category';
    f.node('#nav-settings').click();assert.equal(extras.hidden,false);
    assert.equal(f.node('.app').attrs['data-screen'],'settings');
    assert.equal(f.node('#nav-settings').attrs['aria-current'],'page');
    f.node('#settings-done').click();assert.equal(f.c.FQ.test.state.screen,expected);
    assert.equal(extras.hidden,true);assert.equal(f.node('#offline-progress'),progress);
    assert.equal(progress.value,37);assert.equal(progress.max,100);assert.equal(download.handlers.click,handler);
  }
  f.node('#nav-home').click();f.node('#home-offline').click();
  assert.equal(f.c.FQ.test.state.screen,'settings');assert.equal(f.node('#offline-panel').open,true);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(html.indexOf('id="settings-extras"')>html.indexOf('</main>'),'저장 패널은 매번 교체되는 본문 밖에 둔다');
  for(const id of ['offline-progress','offline-download','nav-home','nav-dex','nav-stats','nav-settings'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+'를 중복 생성하지 않는다');
  assert.match(html,/<button[^>]*id="nav-settings"[^>]*type="button"/,'Enter·Space 기본 조작이 되는 일반 버튼이다');
});

test('문제 진행을 정확히 표시하고 기본 화면으로 나가면 예약 음성과 자동 다음을 정리한다',()=>{
  const f=fixture();f.c.FQ.app.boot();f.c.FQ.storage.updateSettings({mode:'capital',speak:false});f.c.FQ.app.startGame(['kr','jp','fr']);
  assert.equal(f.node('.app').attrs['data-screen'],'quiz');
  assert.match(f.node('main').innerHTML,/aria-label="문제 진행">1 \/ 3</);
  f.c.FQ.test.submit({code:f.c.FQ.test.state.game.current().country.code});f.c.FQ.test.goNext();
  assert.match(f.node('main').innerHTML,/aria-label="문제 진행">2 \/ 3</);
  for(const target of ['home','dex','stats','settings']) {
    const g=fixture();g.c.FQ.app.boot();
    g.c.FQ.screens.dex=()=>g.c.FQ.app.musicScreen('dex');g.c.FQ.screens.stats=()=>g.c.FQ.app.musicScreen('stats');
    const a=g.startVoice(['kr','jp']);a.submit({code:a.state.game.current().country.code});
    const pending=g.releases.at(-1);g.node('#nav-'+target).click();const before=progressSnapshot(g);
    pending();g.finishMusic();g.finishVoice();g.runDelay(900);g.runDelay(1800);
    assert.equal(a.state.game,null,target);assert.equal(a.state.autoNextTimer,null,target);assert.equal(g.spoken.length,0,target);
    assert.equal(g.node('.app').attrs['data-screen'],target);assert.deepEqual(progressSnapshot(g),before,target);
  }
});

test('국기 외 놀이에서는 대결의 적용 범위를 설명하고 저장된 두 이름을 보존한다',()=>{
  for(const mode of ['symbol','place','map','capital']){
    const f=fixture();f.c.FQ.storage.updateSettings({mode,players:['민규','아빠'],dev:{art:true}});f.c.FQ.app.settings();
    const html=f.node('main').innerHTML;
    assert.match(html,/둘이서.*국기 놀이/,'적용되지 않는 이유를 설명한다');
    assert.equal(f.node('#duel').checked,true,mode+' 대결 선택을 지우지 않는다');
    assert.equal(f.node('#duel').disabled,true,mode+' 지금 놀이에서는 대결을 바꿀 수 없다');
    const count=f.node('#setting-count');count.value='5';count.handlers.change({target:count});
    assert.deepEqual([...f.c.FQ.storage.settings().players],['민규','아빠'],mode+' 다른 설정 변경으로 이름을 잃지 않는다');
    f.c.FQ.app.home();tapPlay(f,mode==='map'||mode==='capital'?mode:'art');
    if(mode==='capital')f.node('#capital-choice-start').click();
    else if(mode==='map')f.node('#map-quiz-start').click();
    else if(mode==='symbol'||mode==='place')tapPill(f,mode);

    assert.deepEqual([...f.c.FQ.test.state.game.players],['민규'],mode);
    assert.doesNotMatch(f.node('main').innerHTML,/chip turn/,mode);
    assert.deepEqual([...f.c.FQ.storage.settings().players],['민규','아빠'],mode);
  }
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'choice4',players:['민규','아빠']});g.c.FQ.app.settings();
  assert.equal(g.node('#duel').disabled,false);assert.equal(g.node('#duel').checked,true);
  g.c.FQ.app.home();tapPlay(g,'flag');tapPill(g,'choice4');
  assert.deepEqual([...g.c.FQ.test.state.game.players],['민규','아빠']);assert.match(g.node('main').innerHTML,/chip turn/);
});

test('그림을 못 받아 지나간 문제는 총 문항·정답률·기록·나라 수 어디에도 세지 않는다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});
  f.c.FQ.app.startGame(['kr','jp','fr','de','it','es']);
  const a=f.c.FQ.test,g=a.state.game;
  const scored=new Set();let submitted=0,skipped=0;
  while(a.state.game&&!a.state.game.isOver()){

    const img=f.node('#question-art'),q=a.state.game.current();
    if(skipped===0){img.handlers.error();assert.equal(f.node('#skip').disabled,false);f.node('#skip').click();skipped++;continue;}
    img.handlers.load();a.submit({code:q.country.code});submitted++;scored.add(q.country.code);
    f.releases.at(-1)();f.finishMusic();
    if(a.state.game.isLast())a.goNext();else a.goNext();
    if(a.state.lastSummary&&a.state.game===g&&a.state.game.isOver())break;
  }
  const s=a.state.lastSummary;
  assert.equal(skipped,1);assert.equal(s.unscored,1);assert.ok(submitted>=4,'실제로 여러 문제를 채점했다: '+submitted);
  assert.equal(s.total,submitted,'지나간 문제가 총 문항에 들어갔다');
  assert.equal(s.correct,submitted);
  assert.equal(s.countries,scored.size,'나라 수는 문제 수가 아니라 실제로 만난 나라 수다');
  assert.match(f.node('main').innerHTML,new RegExp('오늘 만난 나라 '+scored.size+'개'));
  assert.match(f.node('main').innerHTML,/<div class="v">100%<\/div>/);
  assert.equal(f.c.FQ.storage.history()[0].total,submitted);
  assert.equal(f.c.FQ.storage.stats().asked,submitted);
  assert.equal(f.c.FQ.storage.wrongList().length,0);
});

test('지도·그림·수도 놀이에는 제한 시간이 없고, 국기 놀이의 시간 초과는 그대로 채점한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'map',timer:10});f.c.FQ.app.startGame(['kr','jp']);
  const a=f.c.FQ.test,first=a.state.game.current().country.code;
  assert.equal(a.state.timerId,null,'지도 놀이에는 초시계가 없다');assert.doesNotMatch(f.node('main').innerHTML,/id="timer-chip"/);
  for(let i=0;i<10;i++)f.runDelay(1000);
  assert.equal(f.c.FQ.storage.axisStat('map',first).seen,0);
  assert.equal(a.state.game.index,0,'시간이 지나도 문제는 그대로 남는다');
  assert.equal(a.state.answered,false);assert.equal(a.state.unscored,0);
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'choice4',timer:10});g.c.FQ.app.startGame(['kr','jp']);
  const flagFirst=g.c.FQ.test.state.game.current().country.code;
  for(let i=0;i<10;i++)g.runDelay(1000);
  assert.equal(g.c.FQ.storage.countryStat(flagFirst).seen,1);assert.equal(g.c.FQ.test.state.answered,true);
});

test('그림 로딩 실패 화면은 큰 그림과 큰 단추로 알리고, 읽어 주는 것은 기존 음원의 그림 이름뿐이다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  const html=f.node('main').innerHTML,artName=f.c.FQ.subjects.kr.symbol.ko;
  const box=html.match(/<div id="art-error" class="art-error" hidden>([\s\S]*?)<\/div>\s*<button class="btn btn-listen"/)[1];
  assert.match(box,/class="art-error-emoji"/);
  assert.match(box,/class="btn btn-primary btn-big" id="art-retry"/);
  assert.match(box,new RegExp('class="btn btn-big" data-speak="'+artName+'"'));
  assert.doesNotMatch(box,/data-speak="대한민국"/,'오류 화면이 나라 이름을 읽어 주면 답을 알려 주는 셈이다');
  f.node('#question-art').handlers.error();
  assert.equal(f.node('#art-error').hidden,false);
  const target=f.node('err-speak');target.setAttribute('data-speak',artName);
  f.clickDelegated('[data-speak]',target);f.releases.at(-1)();
  assert.deepEqual(f.spoken.at(-1),[artName]);
});

test('힌트는 정답을 노출하지 않고, 수도 힌트는 첫 글자 대신 국기·대륙 단서를 준다',()=>{
  // '레바논 삼나무'처럼 소재 이름에 나라 이름이 들어 있으면 그 줄을 뺀다.
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});f.c.FQ.app.startGame(['lb']);
  f.node('#question-art').handlers.load();f.node('#hint').click();
  const hint=f.node('#hint-area').innerHTML;
  assert.doesNotMatch(hint,/레바논/);assert.match(hint,/아시아에 있는 나라예요/);
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});g.c.FQ.app.startGame(['kr']);
  g.node('#question-art').handlers.load();g.node('#hint').click();
  assert.match(g.node('#hint-area').innerHTML,new RegExp(g.c.FQ.subjects.kr.symbol.ko));
  // 수도(2026-09-17 뒤집기): 보기가 국기라 국기 힌트는 곧 정답이다. 1단계는 대륙·지역 단서 + 오답 2개 지우기 + 수도 이름 다시 읽기(기존 음원).
  const h=fixture();h.c.FQ.storage.updateSettings({mode:'capital'});h.c.FQ.app.startGame(['kr']);
  const heardBefore=h.releases.length;h.node('#hint').click();
  const cap=h.node('#hint-area').innerHTML,kr=h.c.FQ.quiz.byCode('kr');
  assert.doesNotMatch(cap,/첫 글자|로 시작해요| 에 있|🚩|대한민국/);
  assert.doesNotMatch(cap,new RegExp(rx(kr.flagHint)));assert.match(cap,/🗺️ 아시아 · 동아시아에 있어요/);
  assert.equal(h.c.FQ.test.state.removed.length,2,'오답 두 개를 지운다');
  assert.equal(h.releases.length,heardBefore+1);h.releases.at(-1)();assert.deepEqual(h.spoken.at(-1),['서울']);
  // 2단계(D24): 힌트 단추가 '🔊 나라 듣기' 로 바뀌어 한 번 더 누르면 '대한민국의 수도예요' 까지 읽는다 — 그 뒤 정답은 기록에 '아직' 으로 남는다.
  assert.equal(h.node('#hint').disabled,false,'한 번 더 누를 수 있다');assert.match(h.node('#hint').innerHTML,/<span>🔊 나라 듣기<\/span>/);
  assert.equal(h.c.FQ.test.state.revealed,false);
  h.node('#hint').click();
  assert.match(h.node('#hint-area').innerHTML,/🏙️ 서울 · 대한민국의 수도예요/);
  assert.equal(h.releases.length,heardBefore+2);h.releases.at(-1)();assert.deepEqual(h.spoken.at(-1),['서울','대한민국의 수도예요']);
  assert.equal(h.node('#capital-listen').getAttribute('data-speak-extra'),'대한민국의 수도예요','🔊 를 다시 눌러도 나라 이름까지');
  assert.equal(h.node('#hint').disabled,true);assert.equal(h.c.FQ.test.state.revealed,true);
  assert.equal(h.c.FQ.test.state.removed.length,2,'오답은 두 개까지만 지운다');
  h.c.FQ.test.submit({code:'kr'});
  const gm=h.c.FQ.test.state.game;
  assert.equal(gm.correct,1,'아이에게는 정답');assert.equal(gm.score,10);
  assert.match(h.node('#feedback-area').innerHTML,/<span class="capital-word">서울<\/span>[\s\S]*<b>대한민국<\/b>의 수도예요/);
  assert.deepEqual([gm.wrong.length,h.c.FQ.storage.allAxisStats('capital').kr.wrong,h.c.FQ.storage.allAxisStats('capital').kr.correct],[1,1,0],'기록은 틀림');
  assert.equal(h.c.FQ.test.state.met.at(-1).correct,false,'여행 카드는 한 번 더 만나요');
  const i=fixture();i.c.FQ.storage.updateSettings({mode:'choice4'});i.c.FQ.app.startGame(['kr']);i.node('#hint').click();
  assert.match(i.node('#hint-area').innerHTML,/아시아에 있고/);assert.equal(i.node('#hint').disabled,true,'국기 놀이 힌트는 한 번');
});

test('그림 퀴즈의 정답 뒤에는 같은 판 재출제 안내가 나타나지 않는다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true},speak:false});
  f.c.FQ.app.startGame(['kr','jp','fr','de','it']);
  const a=f.c.FQ.test,q=a.state.game.current();f.node('#question-art').handlers.load();a.submit({code:q.country.code});
  assert.doesNotMatch(f.node('#feedback-area').innerHTML,/조금 뒤에 한 번 더 만나요/);
  assert.equal(a.state.game.againCount,0);assert.equal(f.spoken.length,0);
});

test('명소 퀴즈도 소개 카드 없이 명소 그림과 국기 보기로 시작한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'place',dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  const html=f.node('main').innerHTML;
  assert.doesNotMatch(html,/meet-quiz|meet-art|meet-next/);
  assert.match(html,/<img id="question-art" src="images\/places\/kr\.webp"/);
  assert.equal((html.match(/class="answer-btn art-choice"/g)||[]).length,4);
});

/* ---- 2026-09-17 문제 화면·정답 카드·지도·결과 시안 ---- */

test('문제 화면은 지시문을 작게, 🔊 들어보기를 크게 두고 힌트·몰라요는 선 그림 한 낱말이며 진행 점 대신 여행 카드 칸 다섯 개다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'map'});f.c.FQ.app.startGame(['kr']);
  const html=f.node('main').innerHTML;
  assert.match(html,/<button class="btn btn-listen" data-speak="대한민국" type="button">🔊 들어보기<\/button>/);
  assert.match(html,/<button class="btn btn-sm btn-tool" id="hint" type="button"><svg[^>]*aria-hidden="true">[\s\S]*?<\/svg><span>힌트<\/span><\/button>/);
  assert.match(html,/<button class="btn btn-sm btn-tool btn-tool-soft" id="skip" type="button"><svg[\s\S]*?<\/svg><span>몰라요<\/span><\/button>/);
  assert.doesNotMatch(html,/같이 보기|모르겠어요|💡|🤷|class="qdots"|game-head|combo-card|combo-fill/);
  assert.equal((html.match(/class="travel-slot(?: filled)?(?: now)?"/g)||[]).length,5);
  assert.match(html,/id="combo-title">여행 카드 0 \/ 5장</);
  assert.match(html,/class="travel-slot now"/,'다음에 채울 칸이 표시된다');
  assert.match(html,/id="xp-fill"/);assert.match(html,/id="xp-val"/);assert.match(html,/id="quit"/);
  // 육지와 위치점의 비율을 함께 보존해 폰에서도 지형이 왜곡되지 않는다.
  assert.match(html,/preserveAspectRatio="xMidYMid meet"/);
  assert.equal(f.node('.map-land').attrs.preserveAspectRatio,undefined);
  assert.equal((html.match(/class="map-pin answer-btn"/g)||[]).length,4);
  // 새로 읽어 주는 문구는 없다 — 문제를 열 때 읽는 것은 없고, 단추 라벨은 화면 글자다.
  assert.equal(f.spoken.length,0);
});

test('그림·명소 퀴즈는 소개 카드 없이 국기 보기 네 개와 소재 이름 듣기를 제공한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  let html=f.node('main').innerHTML;
  assert.doesNotMatch(html,/meet-speak|meet-next|meet-caption/);
  assert.match(html,/<div class="answer-grid art-grid">/);
  assert.equal((html.match(/<button class="answer-btn art-choice" type="button" data-code="[a-z]+"><img src="flags\/[a-z]+\.svg" alt="" width="160" height="120"><span class="art-choice-name">[^<]+<\/span><\/button>/g)||[]).length,4);
  assert.match(html,new RegExp('<button class="btn btn-listen" data-speak="'+rx(f.c.FQ.subjects.kr.symbol.ko)+'" type="button">🔊 들어보기</button>'));
});

test('나라 이름이 담긴 그림·명소 이름은 퀴즈 문제의 글·대체 텍스트·음성에서 숨긴다',()=>{
  for(const {mode,code} of [{mode:'symbol',code:'lb'},{mode:'place',code:'pa'}]) {
    const f=fixture();f.c.FQ.storage.updateSettings({mode,dev:{art:true}});f.c.FQ.app.startGame([code]);
    const html=f.node('main').innerHTML,artName=f.c.FQ.subjects[code][mode].ko;
    assert.doesNotMatch(html,new RegExp(rx(artName)));
    assert.match(html,/alt="나라를 맞힐 (?:상징|명소) 그림"/);
    assert.doesNotMatch(html,/data-speak=/);
    assert.match(html,/id="answer-area"/);
  }
});

test('정답 카드는 나라별 국기·설명·듣기·다음을 제공하고 여행 카드와 보상을 보존한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});f.c.FQ.app.startGame(['kr','jp']);
  const a=f.c.FQ.test,c=a.state.game.current().country;f.node('#question-art').handlers.load();a.submit({code:c.code});
  const html=f.node('#feedback-area').innerHTML,artName=f.c.FQ.subjects[c.code].symbol.ko,kr=f.c.FQ.quiz.byCode('kr');
  assert.match(html,/^<div class="feedback learn discovery-card"><div class="fb-head"><div class="verdict">📖 /);
  assert.match(html,new RegExp('<div class="name-row"><img class="fb-flag" src="flags/'+c.code+'\\.svg" alt="'+rx(c.ko)+' 국기"><div class="kname">'+rx(c.ko)+'</div></div>'));
  assert.match(html,new RegExp('<div class="remember-box"><img class="remember-art" src="images/symbols/'+c.code+'\\.webp" alt="">'));
  assert.match(html,new RegExp('<b class="remember-title">'+rx(artName)+'</b><span class="remember-body">'+rx(c.fact)+'</span>'));
  assert.match(html,/<button class="btn btn-listen btn-listen-soft" id="replay" type="button">🔊 설명 다시 듣기<\/button>/);
  assert.match(html,/<button class="btn btn-primary btn-big btn-go" id="next" type="button">다음 나라 →<\/button>/);
  assert.doesNotMatch(html,/fact-box|info-list|ename|style="/);
  assert.ok(f.node('.quiz-screen').classList.contains('answered'));
  // 머리의 여행 카드 칸은 이 판에서 만난 나라 국기로 차고 #combo-title 은 남는다.
  assert.match(f.node('.travel-slots').innerHTML,new RegExp('^<span class="travel-slot filled"><img src="flags/'+c.code+'\\.svg" alt=""></span><span class="travel-slot"></span>'));
  assert.equal(f.node('#combo-title').textContent,'여행 카드 1 / 5장');
  assert.equal(JSON.stringify(a.state.met.map(m=>[m.country.code,m.correct])),JSON.stringify([[c.code,true]]));
  // 수도·지도·국기 모드의 카드 — 수도는 수도 명패(가장 큰 글자) 아래 '[국기] 나라의 수도예요' 한 줄이고 큰 나라 이름·노란 상자는 없다(D29).
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'capital'});g.c.FQ.app.startGame(['kr']);g.c.FQ.test.submit({code:'jp'});
  assert.match(g.node('#feedback-area').innerHTML,/^<div class="feedback learn discovery-card capital-card"><div class="fb-head">[\s\S]*?<\/div><div class="capital-plate has-art"><figure class="capital-place">[\s\S]*?<\/figure><div class="capital-plate-text"><span class="capital-tag">🏙️ 수도<\/span><span class="capital-word">서울<\/span><\/div><\/div><div class="capital-of"><img class="capital-of-flag" src="flags\/kr\.svg" alt="대한민국 국기"><span class="capital-of-text"><b>대한민국<\/b>의 수도예요<\/span><\/div><button/);
  assert.doesNotMatch(g.node('#feedback-area').innerHTML,/kname|remember-box|name-row/);
  assert.deepEqual([...g.c.FQ.test.state.lastSpeech.lines],['서울','대한민국의 수도예요']);
  const h=fixture();h.c.FQ.storage.updateSettings({mode:'map'});h.c.FQ.app.startGame(['kr']);h.c.FQ.test.submit({code:'kr'});
  assert.match(h.node('#feedback-area').innerHTML,new RegExp('<b class="remember-title">🗺️ 아시아 · 동아시아</b><span class="remember-body">'+rx(kr.fact)+'</span>'));
  const i=fixture();i.c.FQ.storage.updateSettings({mode:'choice4'});i.c.FQ.app.startGame(['kr']);i.c.FQ.test.submit({text:''},true);
  assert.match(i.node('#feedback-area').innerHTML,new RegExp('<div class="remember-hint"><span class="remember-body">🚩 '+rx(kr.flagHint)+'</span></div>'));
  assert.equal(JSON.stringify(i.c.FQ.test.state.met.map(m=>[m.country.code,m.correct])),'[["kr",false]]');
});

test('지도 문제는 해당 나라의 국기·이름·듣기와 지도판을 함께 제공한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'map'});f.c.FQ.app.startGame(['kr']);
  const html=f.node('main').innerHTML;
  assert.match(html,/<div class="flag-stage map-question"><div class="q-label">이 나라는 어디에 있을까요\?<\/div><div class="map-who"><img class="map-question-flag" src="flags\/kr\.svg" alt="대한민국 국기"><div class="big-name">대한민국<\/div><\/div><button class="btn btn-listen" data-speak="대한민국" type="button">🔊 들어보기<\/button><\/div>/);
  assert.match(html,/<div class="quiz-body map-quiz"><div class="quiz-stage-col">/);
});

test('결과 화면은 정확한 나라 수·여행 카드·레벨·상자·새 스티커와 다시 하기 경로를 유지한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'choice4',count:5,speak:false});f.c.FQ.app.startGame(['kr','jp','fr','de','it']);
  const a=f.c.FQ.test,order=[];
  a.state.rng=()=>f.c.FQ.storage.chestState().since>=4?0:0.99;a.state.rngKind=()=>0.5;
  for(let i=0;i<5;i++){const q=a.state.game.current();order.push(q.country);a.submit(i===1?{text:''}:{code:q.country.code},i===1);a.goNext();}
  const html=f.node('main').innerHTML;
  assert.match(html,/<section class="screen result-screen"><div class="result-head">/);
  assert.match(html,/<h2>오늘 여행 끝!<\/h2>/);
  assert.match(html,/<button class="btn btn-sm btn-listen-soft result-replay" id="result-replay" type="button">🔊 응원 다시 듣기<\/button>/);
  assert.match(html,/aria-label="오늘 만난 나라 5개">[\s\S]*?<span class="v" aria-hidden="true">5<small>개<\/small><\/span>/);
  assert.match(html,/aria-label="맞힌 나라 4개">[\s\S]*?<span class="v" aria-hidden="true">4<small>개<\/small><\/span>/);
  assert.equal((html.match(/class="travel-card (?:ok|again)"/g)||[]).length,5);
  assert.match(html,new RegExp('class="travel-card again" type="button" data-code="'+order[1].code+'"[^>]*><span class="tc-flag"><img src="flags/'+order[1].code+'\\.svg" alt="'+rx(order[1].ko)+' 국기"><span class="tc-badge" role="img" aria-label="한 번 더 만나요">'));
  assert.match(html,new RegExp('class="travel-card ok" type="button" data-code="'+order[0].code+'"[\\s\\S]*?aria-label="맞았어요"'));
  assert.match(html,/오늘의 여행 카드 5장[\s\S]*한 번 더 만날 나라 1개/);
  assert.match(html,/<div class="card level-card" role="group" aria-label="씨앗 탐험가 \d+ \/ 300">[\s\S]*class="level-ring"[\s\S]*<span class="level-next" aria-hidden="true">→ 🌿 새싹 탐험가<\/span>[\s\S]*class="level-gain">경험치 \+\d+</);
  assert.match(html,/<div class="chest-note"><span class="chest-note-ic" aria-hidden="true">🎁<\/span>[\s\S]*깜짝 상자 1개를 열었어요![\s\S]*보너스 5점 · 경험치 20[\s\S]*🎁 1/);
  assert.match(html,/<div class="card new-sticker-card"><img src="flags\/[a-z]+\.svg"[\s\S]*<span class="ns-pill">새 스티커! 4개<\/span>[\s\S]*📖 4 \/ 194/);
  assert.match(html,/<button class="btn btn-big btn-go btn-yellow" id="again" type="button"><svg[\s\S]*?<\/svg><span>한 번 더<\/span><\/button>/);
  assert.match(html,/<button class="btn btn-big btn-mid" id="retry-wrong" type="button">📖 한 번 더 만나기<\/button>/);
  assert.match(html,/<button class="btn btn-big btn-mid" id="home" type="button"><svg[\s\S]*?<\/svg><span>홈으로<\/span><\/button>/);
  assert.match(html,/<details class="journey-record card"><summary>학습 기록 보기<\/summary>[\s\S]*class="wrong-grid"/);
  assert.doesNotMatch(html,/result-hero|journey-finish|처음으로/);
  assert.deepEqual(f.spoken,[]);  // 읽어주기 꺼짐 — 결과 화면이 새 문구를 읽지 않는다.
  // 여행 카드를 누르면 나라 설명이 열린다.
  const t=f.node('tc');t.setAttribute('data-code','kr');f.clickDelegated('.travel-card',t);assert.deepEqual(f.modals.map(c=>c.code),['kr']);
  // 상자가 안 열린 판은 다음 상자까지 남은 칸을 보여 주고, 새 스티커·한 번 더 만나기가 없으면 그 카드도 없다.
  const g=fixture();g.c.FQ.storage.recordAnswer('kr',true);g.c.FQ.storage.updateSettings({mode:'choice4',speak:false});g.c.FQ.app.startGame(['kr']);
  g.c.FQ.test.submit({code:'kr'});g.c.FQ.test.goNext();
  const html2=g.node('main').innerHTML;
  assert.match(html2,/<div class="chest-note soft" role="group" aria-label="여행 카드 2 \/ 5장 · 깜짝 상자를 기다려요">/);
  assert.doesNotMatch(html2,/new-sticker-card|retry-wrong|level-gain">경험치 \+0/);
  assert.match(html2,/aria-label="오늘 만난 나라 1개"/);
});

test('깜짝 상자는 선물을 즉시 지급하고 그림을 바로 보여 주며, 닫기 전에는 다음 단추가 잠긴다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'choice4',speak:false});f.c.FQ.storage.recordChest(null);
  f.c.FQ.app.startGame(['kr']);const a=f.c.FQ.test;
  a.state.rng=()=>0;a.state.rngKind=()=>0.2;   // 열림 · 반짝 상자(0.05~0.25)
  a.submit({code:'kr'});
  assert.deepEqual([...f.c.FQ.storage.giftState().owned],['fire_truck'],'화면을 열거나 누르기 전에 선물이 저장된다');
  assert.match(f.node('#feedback-area').innerHTML,/새 그림 선물을 받았어요![\s\S]*소방차/,'정답 카드에도 바로 그림 선물을 보여 준다');
  f.releases.at(-1)();
  const back=f.node('created'),html=back.innerHTML;
  assert.match(html,/<div class="chest-card shiny" role="dialog" aria-modal="true" aria-label="그림 선물을 받았어요">/);
  assert.doesNotMatch(html,/chest-pick|chest-picks|한 번 더 두드려요/);
  assert.match(html,/id="chest-sub">연등에서 나왔어요/,'대한민국은 아시아라 연등');
  assert.match(html,/id="chest-open">[\s\S]*반짝 상자 ✨[\s\S]*\+5점[\s\S]*\+40/);
  assert.match(html,/class="gift-sprite" role="img" aria-label="소방차" style="background-position:0% 0%"/);
  assert.match(html,/<div class="chest-friend" role="group" aria-label="대한민국 친구 카드"><img src="flags\/kr\.svg"/);
  assert.equal(f.music.at(-1).event,'chest');assert.equal(f.music.at(-1).opts.prefer,'chest-01-musicbox');
  assert.equal(f.node('#next').disabled,true);
  assert.equal(f.c.document.activeElement,f.node('#chest-close'));
  assert.equal(a.state.xpGained,50);assert.equal(a.state.game.bonusScore,5);
  assert.deepEqual(JSON.parse(JSON.stringify(f.c.FQ.storage.chestState())),{since:0,opened:1,kinds:{shiny:1}});
  back.handlers.click({target:{closest:(sel)=>sel==='#chest-close'?true:null}});
  assert.equal(f.node('#next').disabled,false);
  // 기존 아홉 선물이 있으면 새 그림 중 하나가 바로 나오고, 황금 상자는 보너스 10점·경험치 60.
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'choice4',speak:false});g.c.FQ.storage.recordChest(null);
  for(const gift of g.c.FQ.progress.giftCatalog().slice(0,9))g.c.FQ.storage.awardGift(gift.id);
  g.c.FQ.app.startGame(['kr']);const b=g.c.FQ.test;b.state.rng=()=>0;b.state.rngKind=()=>0.01;
  b.submit({code:'kr'});
  assert.equal(g.c.FQ.storage.giftState().owned.at(-1),'toy_bus');
  g.releases.at(-1)();
  const back2=g.node('created');assert.match(back2.innerHTML,/class="chest-card gold"[\s\S]*황금 상자 👑[\s\S]*\+10점[\s\S]*\+60/);
  assert.match(back2.innerHTML,/class="gift-sprite gift-sheet-2"[\s\S]*장난감 버스/);
  assert.equal(b.state.game.bonusScore,10);assert.equal(b.state.xpGained,70);
});

test('세 번째 선물 그림도 바로 보이고, 27종을 모두 모은 뒤에만 중복 선물이 나온다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'choice4',speak:false});f.c.FQ.storage.recordChest(null);
  for(const gift of f.c.FQ.progress.giftCatalog().slice(0,18))f.c.FQ.storage.awardGift(gift.id);
  f.c.FQ.app.startGame(['kr']);const a=f.c.FQ.test;a.state.rng=()=>0;a.submit({code:'kr'});
  assert.equal(f.c.FQ.storage.giftState().owned.at(-1),'race_car');
  assert.match(f.node('#feedback-area').innerHTML,/class="gift-sprite gift-sheet-3"[\s\S]*경주차/);
  f.releases.at(-1)();
  assert.match(f.node('created').innerHTML,/class="gift-sprite gift-sheet-3"/);

  const g=fixture();g.c.FQ.storage.updateSettings({mode:'choice4',speak:false});g.c.FQ.storage.recordChest(null);
  for(const gift of g.c.FQ.progress.giftCatalog())g.c.FQ.storage.awardGift(gift.id);
  g.c.FQ.app.startGame(['kr']);const b=g.c.FQ.test;b.state.rng=()=>0;b.submit({code:'kr'});
  assert.equal(g.c.FQ.storage.giftState().owned.length,27);
  assert.match(g.node('#feedback-area').innerHTML,/그림 선물을 다시 만났어요!/);
  assert.equal(b.state.giftsFound[0].isNew,false);
});

test('새 선물은 27종 전체에서 무작위로 골라 초반부터 추가 그림도 나올 수 있다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'choice4',speak:false});f.c.FQ.storage.recordChest(null);
  f.c.FQ.app.startGame(['kr']);const a=f.c.FQ.test;
  const rolls=[0,0.5];a.state.rng=()=>rolls.shift();a.state.rngKind=()=>0.5;
  a.submit({code:'kr'});
  assert.deepEqual([...f.c.FQ.storage.giftState().owned],['frog_plush']);
  assert.match(f.node('#feedback-area').innerHTML,/class="gift-sprite gift-sheet-2"[\s\S]*개구리 인형/);
});

test('설정은 제한 시간 적용 범위를 설명하고 다른 놀이에서도 저장된 선택은 지우지 않는다',()=>{
  for(const [mode,enabled] of [['choice4',true],['voice',true],['capital',false],['map',false],['symbol',false]]){
    const f=fixture();f.c.FQ.storage.updateSettings({mode,timer:10,dev:{art:true}});f.c.FQ.app.settings();
    assert.equal(f.node('#setting-timer').value,'10',mode+' 저장한 10초를 표시한다');
    assert.equal(f.node('#setting-timer').disabled,!enabled,mode);
    assert.equal(f.c.FQ.storage.settings().timer,10,mode+' 다른 놀이를 골랐다고 제한 시간 설정을 지우지 않는다');
    if(!enabled)assert.match(f.node('main').innerHTML,/국기 놀이.*시간 제한|시간 제한.*국기 놀이/,mode);
  }
});

test('명소 정답 카드에는 수도 한 줄과 듣기 단추가 있고 누르면 수도 이름과 설명 두 문구를 읽는다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'place',speak:false,dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  const a=f.c.FQ.test;f.node('#question-art').handlers.load();a.submit({code:'kr'});
  const html=f.node('#feedback-area').innerHTML;
  assert.match(html,/<span class="remember-capital">🏙️ 서울 · 대한민국의 수도예요 <button class="btn btn-sm btn-ghost cap-listen" type="button" data-speak="서울" data-speak-extra="대한민국의 수도예요" data-label="🔊" aria-label="수도 들어보기">🔊<\/button><\/span>/);
  const t=f.node('cap');t.setAttribute('data-speak','서울');t.setAttribute('data-speak-extra','대한민국의 수도예요');t.setAttribute('data-label','🔊');
  f.clickDelegated('[data-speak]',t);f.releases.at(-1)();
  assert.deepEqual(f.spoken.at(-1),['서울','대한민국의 수도예요']);
  // 상징물 카드에는 수도 줄이 없다.
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'symbol',speak:false,dev:{art:true}});g.c.FQ.app.startGame(['kr']);
  g.node('#question-art').handlers.load();g.c.FQ.test.submit({code:'kr'});
  assert.doesNotMatch(g.node('#feedback-area').innerHTML,/remember-capital/);
});
/* ---- 2026-09-18 말로 답하기 (D25): 확실한 중간 결과 바로 채점 · 소리 닮은꼴 인정 · 맞히면 저절로 다음 ---- */
test('중간 결과라도 목표 나라 이름이 확실하면 바로 채점하고, 인도·기니처럼 앞부분이 겹치는 나라는 끝까지 듣는다',()=>{
  const f=fixture(),a=f.startVoice(['fr']);f.c.callbacks.start();
  f.c.callbacks.interim('프');assert.equal(a.state.answered,false);assert.equal(f.node('#heard').textContent,'프');
  f.c.callbacks.interim('프랑스');assert.equal(a.state.answered,true);assert.equal(a.state.game.correct,1);
  // 인도는 인도네시아의 앞부분이라 최종 결과를 기다린다.
  const g=fixture(),b=g.startVoice(['in']);g.c.callbacks.start();
  g.c.callbacks.interim('인도');assert.equal(b.state.answered,false,'인도는 끝까지 듣는다');
  g.c.callbacks.result(['인도']);assert.equal(b.state.answered,true);assert.equal(b.state.game.correct,1);
  // 소리 닮은꼴은 중간 결과에서도 인정한다.
  const h=fixture(),c=h.startVoice(['ke']);h.c.callbacks.start();
  h.c.callbacks.interim('캐냐');assert.equal(c.state.answered,true);assert.equal(c.state.game.correct,1);
  // 다른 나라 이름은 중간 결과로 채점하지 않고 최종 결과에서 오답이다.
  const i=fixture(),d=i.startVoice(['fr']);i.c.callbacks.start();
  i.c.callbacks.interim('독일');assert.equal(d.state.answered,false);
  i.c.callbacks.result(['독일']);assert.equal(d.state.answered,true);assert.equal(d.state.game.correct,0);
});

test('말로 맞히면 나라 이름을 다시 읽고 저절로 다음 나라로 가고, 틀리거나 다른 놀이에서는 기다린다',()=>{
  const f=fixture(),a=f.startVoice(['id','fr']);
  const first=a.state.game.current().country.code;
  a.submit({code:first});assert.equal(a.state.answered,true);
  f.releases.at(-1)();                                    // 마이크 해제 → 정답 이름 즉시 낭독
  assert.deepEqual(f.spoken.at(-1),[a.state.game.current().country.ko]);
  assert.equal(f.music.length,0,'말하기 정답에서 발견 음악을 기다리지 않는다');
  f.runDelay(900);assert.equal(a.state.game.index,0,'낭독이 끝나기 전에는 안 넘어간다');
  f.finishVoice();                                         // 이름 낭독 끝 → 0.9초 예약
  assert.ok([...f.timers.values()].some(t=>t.delay===900),'0.9초 뒤 다음 나라');
  f.runDelay(900);
  assert.equal(a.state.game.index,1);assert.equal(a.state.answered,false);assert.equal(a.state.autoNextTimer,null);
  assert.equal(f.c.listening,true,'다음 문제에서 마이크가 다시 열린다');
  // 틀리면(몰라요) 저절로 넘어가지 않는다.
  a.submit({text:''},true);f.releases.at(-1)();f.finishMusic();f.finishVoice();
  assert.ok(![...f.timers.values()].some(t=>t.delay===900));
  f.runDelay(900);assert.equal(a.state.game.index,1);assert.equal(a.state.answered,true);
  // 국기 보고 고르기는 종전대로 기다린다.
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'choice4'});g.c.FQ.app.startGame(['kr','jp']);const b=g.c.FQ.test;
  b.submit({code:b.state.game.current().country.code});g.releases.at(-1)();g.finishMusic();g.finishVoice();
  assert.ok(![...g.timers.values()].some(t=>t.delay===900));g.runDelay(900);assert.equal(b.state.game.index,0);
});

test('마이크로 국기 이름을 맞히면 정답 이름을 다시 읽고 낭독이 끝나면 다음 문제를 자동으로 연다',()=>{
  const f=fixture(),a=f.startVoice(['kr','jp']);
  const first=a.state.game.current().country;
  f.c.callbacks.start();
  f.c.callbacks.result([first.ko]);
  assert.equal(a.state.game.correct,1);
  assert.equal(a.state.answered,true);
  assert.equal(f.spoken.length,0,'마이크가 닫히기 전에는 읽지 않는다');
  f.releases.at(-1)();
  assert.deepEqual(f.spoken.at(-1),[first.ko]);
  assert.equal(f.music.length,0);
  assert.equal(a.state.game.index,0,'나라 이름을 읽는 동안에는 현재 국기를 유지한다');
  f.finishVoice();
  f.runDelay(900);
  assert.equal(a.state.game.index,1);
  assert.equal(a.state.answered,false);
  assert.equal(f.c.listening,true);
});

test('낭독 종료 알림이 오지 않아도 말하기 정답 뒤에 다음 국기로 진행한다',()=>{
  const f=fixture(),a=f.startVoice(['kr','jp']);
  const first=a.state.game.current().country;
  f.c.callbacks.result([first.ko]);
  f.releases.at(-1)();
  assert.deepEqual(f.spoken.at(-1),[first.ko]);
  const recovery=[...f.timers.values()].find(t=>!t.interval&&t.delay>=2000&&t.delay<=15000);
  assert.ok(recovery,'브라우저가 음성 종료 알림을 놓쳐도 진행할 수 있는 제한 시간이 있어야 한다');
  f.runDelay(recovery.delay);
  f.runDelay(900);
  assert.equal(a.state.game.index,1);
  assert.equal(f.c.listening,true);
});

test('말하기 정답 뒤 수동으로 다음을 누르거나 홈으로 나가면 예약된 자동 이동을 취소한다',()=>{
  const f=fixture(),a=f.startVoice(['kr','jp','fr']);
  a.submit({code:a.state.game.current().country.code});
  f.releases.at(-1)();f.finishVoice();
  assert.ok([...f.timers.values()].some(t=>t.delay===900));
  f.node('#next').click();
  assert.equal(a.state.game.index,1);
  f.runDelay(900);
  assert.equal(a.state.game.index,1,'수동으로 연 두 번째 국기를 자동 예약이 건너뛰지 않는다');

  a.submit({code:a.state.game.current().country.code});
  f.releases.at(-1)();f.finishVoice();
  assert.ok([...f.timers.values()].some(t=>t.delay===900));
  f.c.FQ.app.home();
  f.runDelay(900);
  assert.equal(a.state.game,null);
  assert.match(f.node('main').innerHTML,/home-kid/);
});

test('말하기 정답으로 선물을 받으면 화면을 닫은 뒤 자동으로 다음 국기를 연다',()=>{
  const f=fixture();
  for(let i=0;i<4;i++){f.c.FQ.storage.recordAnswer('fr',false);f.c.FQ.storage.recordChest(null);}
  const a=f.startVoice(['kr','jp']);a.state.rng=()=>0;a.state.rngKind=()=>0.5;
  const first=a.state.game.current().country;
  a.submit({code:a.state.game.current().country.code});
  f.releases.at(-1)();
  assert.deepEqual(f.spoken.at(-1),[first.ko]);
  f.finishVoice();
  assert.equal(f.music.at(-1).event,'chest');
  assert.equal(f.node('#next').disabled,true);
  assert.ok(![...f.timers.values()].some(t=>t.delay===900));
  f.node('created').handlers.click({target:{closest:()=>true}});
  assert.equal(f.node('#next').disabled,false);
  assert.ok([...f.timers.values()].some(t=>t.delay===900));
  f.runDelay(900);
  assert.equal(a.state.game.index,1);
  assert.equal(f.c.listening,true);
});

test('상자 앞에서 이름 재생이 실패하면 닫아도 기다리고, 다시 듣기에 성공하면 자동으로 진행한다',()=>{
  const f=fixture();
  for(let i=0;i<4;i++){f.c.FQ.storage.recordAnswer('fr',false);f.c.FQ.storage.recordChest(null);}
  const a=f.startVoice(['kr','jp']);a.state.rng=()=>0;a.state.rngKind=()=>0.5;
  const first=a.state.game.current().country;
  a.submit({code:a.state.game.current().country.code});
  f.releases.at(-1)();f.playbackFailures.at(-1)();
  assert.equal(f.music.at(-1).event,'chest');
  f.node('created').handlers.click({target:{closest:()=>true}});
  assert.ok(![...f.timers.values()].some(t=>t.delay===900),'이름을 못 들었으면 상자를 닫아도 자동으로 넘어가지 않는다');
  f.node('#replay').click();f.releases.at(-1)();
  assert.deepEqual(f.spoken.at(-1),[first.ko,first.flagHint]);
  f.finishVoice();
  assert.ok([...f.timers.values()].some(t=>t.delay===900));
  f.runDelay(900);
  assert.equal(a.state.game.index,1);
});

test('자동 넘어가기는 설명 다시 듣기를 누르면 미뤄졌다가 다시 들은 뒤에 가고, 읽어주기가 꺼져 있으면 1.8초 뒤에 간다',()=>{
  const f=fixture(),a=f.startVoice(['id','fr']);
  a.submit({code:a.state.game.current().country.code});f.releases.at(-1)();f.finishVoice();
  assert.ok([...f.timers.values()].some(t=>t.delay===900));
  f.node('#replay').click();
  assert.ok(![...f.timers.values()].some(t=>t.delay===900),'다시 듣기를 누르면 예약이 사라진다');
  f.releases.at(-1)();                                     // 다시 듣기는 음악 없이 바로 낭독
  assert.equal(f.spoken.length,2);
  f.runDelay(900);assert.equal(a.state.game.index,0);
  f.finishVoice();f.runDelay(900);assert.equal(a.state.game.index,1);
  // 읽어주기 꺼짐: 낭독 없이 1.8초 뒤.
  const g=fixture();g.c.FQ.storage.updateSettings({speak:false});const b=g.startVoice(['id','fr']);
  b.submit({code:b.state.game.current().country.code});g.releases.at(-1)();g.finishMusic();
  assert.equal(g.spoken.length,0);assert.ok([...g.timers.values()].some(t=>t.delay===1800));
  g.runDelay(1800);assert.equal(b.state.game.index,1);
  // 마지막 문제를 맞히면 결과 화면으로 간다.
  b.submit({code:b.state.game.current().country.code});g.releases.at(-1)();g.finishMusic();g.runDelay(1800);
  assert.match(g.node('main').innerHTML,/result-screen/);
});

/* ---- 2026-09-18 수도 놀이 후속 묶음 (D26~D28): 명소 그림 · 오늘 만난 수도 다시 듣기 · 국기 보고 수도 말하기 ---- */
test('수도 안의 명소 그림은 공부 카드와 정답 카드에만 붙고, 수도 밖 명소와 그림을 끈 경우에는 없다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital',dev:{art:true}});
  f.c.FQ.app.home();const pool=f.c.FQ.quiz.pool;f.c.FQ.quiz.pool=()=>[f.c.FQ.quiz.byCode('kr')];
  tapPlay(f,'capital');f.node('#capital-study-start').click();
  f.c.FQ.quiz.pool=pool;
  // 그림은 수도 명패 안, 수도 이름 옆에 선다(D29) — 광화문은 대한민국이 아니라 서울의 그림이다.
  const plate='<div class="capital-plate has-art"><figure class="capital-place"><img src="images/places/kr.webp" alt="광화문"><figcaption>광화문</figcaption></figure><div class="capital-plate-text"><span class="capital-tag">🏙️ 수도</span><span class="capital-word">서울</span></div></div>';
  assert.ok(f.node('main').innerHTML.includes('<div class="card capital-study-card">'+plate));
  f.c.FQ.app.startGame(['kr']);assert.doesNotMatch(f.node('main').innerHTML,/capital-place/,'문제 화면에는 그림이 없다');
  f.c.FQ.test.submit({code:'kr'});
  assert.ok(f.node('#feedback-area').innerHTML.includes(plate+'<div class="capital-of">'),'정답 카드도 같은 명패');
  assert.deepEqual([...f.c.FQ.test.state.lastSpeech.lines],['서울','대한민국의 수도예요'],'그림 이름은 읽지 않는다');
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'capital',dev:{art:true}});g.c.FQ.app.home();
  const poolG=g.c.FQ.quiz.pool;g.c.FQ.quiz.pool=()=>[g.c.FQ.quiz.byCode('mx')];
  tapPlay(g,'capital');g.node('#capital-study-start').click();g.c.FQ.quiz.pool=poolG;
  assert.doesNotMatch(g.node('main').innerHTML,/capital-place/,'치첸이트사는 수도 밖이라 붙이지 않는다');
  g.c.FQ.app.startGame(['mx']);g.c.FQ.test.submit({code:'mx'});assert.doesNotMatch(g.node('#feedback-area').innerHTML,/capital-place|has-art/);
  const h=fixture();h.c.FQ.storage.updateSettings({mode:'capital',dev:{art:false}});h.c.FQ.app.home();
  h.c.FQ.quiz.pool=()=>[h.c.FQ.quiz.byCode('kr')];tapPlay(h,'capital');h.node('#capital-study-start').click();
  assert.doesNotMatch(h.node('main').innerHTML,/capital-place/,'그림을 끄면 없다');
});

test('수도 놀이의 결과에는 오늘 만난 수도 다시 듣기가 있어 국기마다 듣고 전부 이어 들을 수 있다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital'});f.c.FQ.app.startGame(['kr','jp']);
  const a=f.c.FQ.test;
  for(let n=0;n<20&&a.state.game&&!a.state.game.isOver();n++){const cur=a.state.game.current();if(!cur)break;a.submit({code:cur.country.code});a.goNext();}
  const res=f.node('main').innerHTML;
  assert.match(res,/result-screen/);assert.match(res,/🏙️ 오늘 만난 수도 다시 듣기/);
  const recapLines=a.state.met.flatMap(m=>[m.country.capital,m.country.ko+'의 수도예요']);
  assert.ok(res.includes('id="capital-recap-all" type="button" data-speak-lines="'+recapLines.join('|')+'"'));
  // 칸의 큰 글자는 수도 이름, 나라는 그 아래 '○○의 수도'(D29).
  assert.match(res,/<div class="recap-item"><img src="flags\/kr\.svg" alt="대한민국 국기"><span class="c">서울<\/span><span class="n">대한민국의 수도<\/span><button class="btn btn-sm btn-ghost recap-listen" type="button" data-speak="서울" data-speak-extra="대한민국의 수도예요" data-label="🔊" aria-label="대한민국의 수도 서울 듣기">🔊<\/button><\/div>/);
  // 이어 듣기: 응원을 멈추고 네 문구를 차례로 읽는다(가짜 DOM 은 속성을 안 읽으니 직접 넣는다).
  const all=f.node('#capital-recap-all');all.setAttribute('data-speak-lines','서울|대한민국의 수도예요|도쿄|일본의 수도예요');all.setAttribute('data-label','🔊 이어 듣기');
  f.clickDelegated('[data-speak]',all);f.releases.at(-1)();
  assert.deepEqual(f.spoken.at(-1),['서울','대한민국의 수도예요','도쿄','일본의 수도예요']);
  const one=f.node('recap-one');one.setAttribute('data-speak','도쿄');one.setAttribute('data-speak-extra','일본의 수도예요');one.setAttribute('data-label','🔊');
  f.clickDelegated('[data-speak]',one);f.releases.at(-1)();assert.deepEqual(f.spoken.at(-1),['도쿄','일본의 수도예요']);
  // 국기 놀이 결과에는 없다.
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'choice4'});g.c.FQ.app.startGame(['kr']);g.c.FQ.test.submit({code:'kr'});g.c.FQ.test.goNext();
  assert.match(g.node('main').innerHTML,/result-screen/);assert.doesNotMatch(g.node('main').innerHTML,/capital-recap/);
});

test('국기 보고 수도 말하기는 공부 카드 없이 바로 시작하고, 힌트로 들은 수도는 아직 익히는 기록으로 남는다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capitalVoice'});f.c.FQ.app.startGame(['kr']);
  const a=f.c.FQ.test;
  assert.doesNotMatch(f.node('main').innerHTML,/meet-card|meet-next/);
  const html=f.node('main').innerHTML;
  // 무대: 국기·나라 이름 아래 물음표 명패(수도가 답이라 이름 자리는 '?', D29) → 🔊(나라 이름).
  assert.match(html,/<div class="flag-stage capital-say"><div class="q-label">🏙️ 이 나라의 수도를 말해 보세요<\/div><div class="map-who"><img class="map-question-flag" src="flags\/kr\.svg" alt="대한민국 국기"><div class="big-name">대한민국<\/div><\/div><div class="capital-plate is-hidden" id="say-plate"><div class="capital-plate-text"><span class="capital-tag">🏙️ 수도<\/span><span class="capital-word" id="say-plate-word">\?<\/span><\/div><\/div><button class="btn btn-listen" id="say-listen" data-speak="대한민국" type="button">🔊 들어보기<\/button><\/div>/);
  assert.doesNotMatch(html.slice(0,html.indexOf('id="answer-area"')),/서울/,'문제 무대에는 수도 이름이 없다');
  assert.match(html,/id="mic"/);assert.match(html,/placeholder="수도 이름을 써 보세요"/);assert.doesNotMatch(html,/timer-chip/);
  assert.equal(f.c.listening,true,'퀴즈 시작 흐름에서 마이크를 연다');
  f.c.callbacks.start();assert.match(f.node('#listen-state').textContent,/수도 이름을 끝까지/);
  // 나라 이름(대한민국)은 수도가 아니라 흘려듣고, 서울은 정답.
  f.c.callbacks.interim('대한민국');assert.equal(a.state.answered,false);
  f.c.callbacks.interim('서울');assert.equal(a.state.answered,true);assert.equal(a.state.game.correct,1);
  assert.deepEqual([...a.state.lastSpeech.lines],['서울','대한민국의 수도예요']);
  assert.match(f.node('#feedback-area').innerHTML,/<span class="capital-word">서울<\/span>[\s\S]*<b>대한민국<\/b>의 수도예요/);
  assert.equal(f.c.FQ.storage.allAxisStats('capital').kr.correct,1);assert.deepEqual(Object.keys(f.c.FQ.storage.allCountryStats()),[]);
  // 다른 나라의 수도를 말하면 오답이다.
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'capitalVoice'});g.c.FQ.app.startGame(['kr']);g.c.callbacks.start();
  g.c.callbacks.result(['도쿄']);assert.equal(g.c.FQ.test.state.answered,true);assert.equal(g.c.FQ.test.state.game.correct,0);
  assert.equal(g.c.FQ.storage.allAxisStats('capital').kr.wrong,1);
  // 힌트: 수도를 들려주고(듣고 따라 말하기) 그 뒤 정답은 기록에 아직으로 남는다. 듣고 나면 마이크를 다시 연다.
  const h=fixture();h.c.FQ.storage.updateSettings({mode:'capitalVoice'});h.c.FQ.app.startGame(['kr']);h.c.callbacks.start();
  const btn=h.node('#say-listen');h.node('#hint').click();
  assert.equal(h.c.FQ.test.state.revealed,true);assert.match(h.node('#hint-area').innerHTML,/🏙️ 서울 · 대한민국의 수도예요/);
  // 물음표 명패에 수도 이름이 큰 글자로 뜬다(D29).
  assert.equal(h.node('#say-plate-word').textContent,'서울');assert.equal(h.node('#say-plate-word').className,'capital-word');
  assert.equal(btn.getAttribute('data-speak'),'서울');assert.equal(btn.getAttribute('data-speak-extra'),'대한민국의 수도예요');
  assert.equal(h.node('#hint').disabled,true);
  assert.equal(h.c.listening,false,'읽는 동안 마이크를 놓는다');
  h.releases.at(-1)();assert.deepEqual(h.spoken.at(-1),['서울','대한민국의 수도예요']);
  h.finishVoice();assert.equal(h.c.listening,true,'듣고 나면 다시 듣는다');
  h.c.callbacks.start();h.c.callbacks.interim('서울');
  const st=h.c.FQ.storage.allAxisStats('capital').kr;
  assert.equal(h.c.FQ.test.state.game.correct,1);assert.deepEqual([st.correct,st.wrong],[0,1],'들려준 수도를 따라 말한 것은 아직이다');
  // 홈: 마지막 세부 모드에 관계없이 공부와 퀴즈를 선택할 수 있다.
  const i=fixture();i.c.FQ.storage.updateSettings({mode:'capitalVoice'});i.c.FQ.app.home();
  assert.doesNotMatch(i.node('main').innerHTML,/data-mode="capitalVoice"/);assert.match(i.node('main').innerHTML,/class="play-d">공부하기 · 문제 풀기</);
  i.c.FQ.app.settings();assert.equal(i.node('#duel').disabled,true,'수도 축이라 대결은 없다');
});

/* ---- 2026-09-19 수도 명패 (D29): 수도 놀이의 주인공은 수도 이름 ---- */
test('긴 수도 이름은 잘리지 않게 길이별 명패 스타일을 선택한다',()=>{
  const word=(code)=>{
    const f=fixture();f.c.FQ.storage.recordAnswer(code,true,'capital');f.c.FQ.storage.updateSettings({mode:'capital'});f.c.FQ.app.startGame([code]);
    return f.node('main').innerHTML.match(/<span class="(capital-word[^"]*)">([^<]+)<\/span>/).slice(1).join('|');
  };
  assert.equal(word('kr'),'capital-word|서울');
  assert.equal(word('hu'),'capital-word|부다페스트','다섯 글자까지는 가장 큰 글자');
  assert.equal(word('my'),'capital-word len-m|쿠알라룸푸르');
  assert.equal(word('us'),'capital-word len-m|워싱턴 D.C.','빈칸은 세지 않는다');
  assert.equal(word('ar'),'capital-word len-l|부에노스아이레스');
  assert.equal(word('lk'),'capital-word len-l|스리자야와르데네푸라코테');
});


/* ---- 2026-09-17 수도 놀이 뒤집기 (시안 PhoneCapital · D17 채택 B: capital 축 분리 + 🏙️ 도장) ---- */

function progressSnapshot(f) {
  const {settings,...records}=JSON.parse(f.c.FQ.storage.exportJson());
  return records;
}
function startStudy(f,codes) {
  f.c.FQ.app.home();
  const pool=f.c.FQ.quiz.pool;
  if(codes)f.c.FQ.quiz.pool=()=>codes.map(code=>f.c.FQ.quiz.byCode(code));
  try { tapPlay(f,'capital');f.node('#capital-study-start').click(); }
  finally { f.c.FQ.quiz.pool=pool; }
  return f.c.FQ.test;
}

test('수도 메뉴는 공부와 두 퀴즈를 분리하고, 퀴즈를 고르면 공부 카드 없이 바로 문제를 낸다',()=>{
  for(const [button,mode] of [['#capital-choice-start','capital'],['#capital-voice-start','capitalVoice']]) {
    const f=fixture();f.c.FQ.app.home();const before=progressSnapshot(f);
    tapPlay(f,'capital');const html=f.node('main').innerHTML;
    for(const id of ['capital-study-start','capital-choice-start','capital-voice-start'])assert.ok(html.includes('id="'+id+'"'));
    assert.equal(f.c.FQ.test.state.game,null);assert.equal(f.spoken.length,0);
    assert.deepEqual(progressSnapshot(f),before);
    f.node(button).click();
    assert.equal(f.c.FQ.test.state.game.current().mode,mode);
    assert.doesNotMatch(f.node('main').innerHTML,/meet-next|meet-card|capital-study-card/);
    assert.equal(f.c.FQ.storage.settings().lastMode.capital,mode);
  }
});

test('수도 공부는 자유롭게 앞뒤로 듣고 무채점으로 끝나며 퀴즈는 따로 골라야 시작한다',()=>{
  const f=fixture();f.c.FQ.app.boot();f.c.FQ.storage.updateSettings({count:3,timer:10});
  f.c.FQ.storage.recordAnswer('kr',true,'capital');f.c.FQ.storage.recordAnswer('fr',false);
  const before=progressSnapshot(f),a=startStudy(f,['mx','jp','kr']);
  const first=a.state.study.countries[0];
  assert.equal(a.state.game,null);assert.equal(a.state.timerId,null);assert.ok(!f.c.listening);
  assert.equal(f.node('#study-prev').disabled,true);f.node('#study-prev').click();assert.equal(a.state.study.index,0);
  assert.doesNotMatch(f.node('main').innerHTML,/answer-area|meet-next|id="hint"|id="skip"|timer-chip|travel-chip/);
  assert.match(f.node('main').innerHTML,/id="study-count">1 \/ 3/);
  assert.ok(f.node('main').innerHTML.includes(first.capital));assert.ok(f.node('main').innerHTML.includes(first.ko+' 국기'));
  f.releases.at(-1)();assert.deepEqual(f.spoken.at(-1),[first.capital,first.ko+'의 수도예요']);
  f.node('#study-speak').click();f.releases.at(-1)();assert.deepEqual(f.spoken.at(-1),[first.capital,first.ko+'의 수도예요']);
  for(const handler of f.events.keydown)handler({key:'1',target:{tagName:'DIV'},preventDefault(){}});
  assert.equal(a.state.study.index,0);assert.deepEqual(progressSnapshot(f),before);
  f.node('#study-next').click();assert.equal(a.state.study.index,1);assert.equal(f.node('#study-prev').disabled,false);
  f.node('#study-prev').click();assert.equal(a.state.study.index,0);assert.equal(a.state.study.countries[0].code,first.code);
  for(let n=0;n<3;n++)f.node('#study-next').click();
  assert.match(f.node('main').innerHTML,/수도 공부를 마쳤어요/);assert.equal(a.state.game,null);
  assert.deepEqual(progressSnapshot(f),before,'문제 수·정답·점수·도장·상자·게임 기록을 모두 보존한다');
  f.node('#study-quiz').click();assert.match(f.node('main').innerHTML,/capital-menu/);assert.equal(a.state.game,null);
  f.node('#capital-choice-start').click();assert.equal(a.state.game.current().mode,'capital');
});

test('수도 공부는 선택한 난이도·대륙·개수를 따르고 새 묶음은 아직 보지 않은 수도부터 펼친다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({count:3,level:'1',continent:'아시아',speak:false});
  const expected=f.c.FQ.quiz.pool({level:'1',continent:'아시아',axis:'capital'}).map(c=>c.code);
  const a=startStudy(f),first=[...a.state.study.countries].map(c=>c.code);
  assert.equal(first.length,3);assert.equal(new Set(first).size,3);assert.ok(first.every(code=>expected.includes(code)));
  for(let n=0;n<3;n++)f.node('#study-next').click();
  f.node('#study-more').click();
  const second=[...a.state.study.countries].map(c=>c.code);
  assert.equal(second.length,3);assert.equal(new Set(second).size,3);assert.ok(second.every(code=>!first.includes(code)));
  assert.equal(a.state.game,null);
  f.c.FQ.storage.updateSettings({count:'all'});startStudy(f);
  assert.equal(a.state.study.countries.length,expected.length);assert.equal(new Set(a.state.study.countries.map(c=>c.code)).size,expected.length);
  const g=fixture();g.c.FQ.quiz.pool=()=>[];startStudy(g);
  assert.match(g.node('main').innerHTML,/이 범위에는 수도가 없어요/);g.node('#study-home').click();
  assert.match(g.node('main').innerHTML,/home-kid/);
});

test('공부에서 다음 수도·다시 듣기·공부 완료로 이동하면 이전 음성 예약을 취소한다',()=>{
  const f=fixture(),a=startStudy(f,['kr','jp']);const oldRelease=f.releases.at(-1);
  f.node('#study-next').click();const nextRelease=f.releases.at(-1),current=a.state.study.countries[1];
  oldRelease();assert.equal(f.spoken.length,0,'다음 카드로 간 뒤 이전 수도를 읽지 않는다');
  f.node('#study-speak').click();const replayRelease=f.releases.at(-1);
  nextRelease();assert.equal(f.spoken.length,0,'자동 낭독과 다시 듣기가 겹치지 않는다');
  replayRelease();assert.deepEqual(f.spoken.at(-1),[current.capital,current.ko+'의 수도예요']);
  f.node('#study-speak').click();const staleRelease=f.releases.at(-1);
  f.node('#study-next').click();staleRelease();
  assert.equal(f.spoken.length,1);assert.match(f.node('main').innerHTML,/수도 공부를 마쳤어요/);
});

test('수도 공부를 떠나거나 앱을 가리면 음성·마이크 콜백이 이전 카드를 되살리지 않는다',()=>{
  for(const leave of ['menu','home','dex','stats','hidden']) {
    const f=fixture();f.c.FQ.app.boot();const a=startStudy(f,['kr','jp']);
    const release=f.releases.at(-1),before=progressSnapshot(f);
    if(leave==='menu')f.node('#study-back').click();
    if(leave==='home')f.c.FQ.app.home();
    if(leave==='dex')f.node('#nav-dex').click();
    if(leave==='stats')f.node('#nav-stats').click();
    if(leave==='hidden'){f.c.document.hidden=true;f.events.visibilitychange.forEach(fn=>fn());}
    const html=f.node('main').innerHTML;release();f.runDelay(900);f.runDelay(1800);
    assert.equal(f.spoken.length,0,leave);assert.ok(!f.c.listening,leave);assert.equal(a.state.game,null,leave);
    assert.equal(f.node('main').innerHTML,html,leave);assert.deepEqual(progressSnapshot(f),before,leave);
  }
  const f=fixture();f.c.FQ.app.boot();f.startVoice(['kr']);const callbacks=f.c.callbacks;
  startStudy(f,['jp']);callbacks.result(['대한민국']);
  assert.equal(f.c.FQ.test.state.game,null);assert.match(f.node('main').innerHTML,/capital-study/);
  assert.equal(f.c.FQ.storage.stats().asked,0,'이전 퀴즈의 늦은 음성 답을 채점하지 않는다');
});

test('오프라인 공부는 연결 상태나 음원 실패와 관계없이 다음 수도로 진행하고 기록을 남기지 않는다',()=>{
  const f=fixture();f.c.navigator.onLine=false;f.c.FQ.app.boot();
  f.c.FQ.storage.updateSettings({mode:'capitalVoice',speak:false});const a=startStudy(f,['mx','kr']);
  const before=progressSnapshot(f);assert.equal(f.spoken.length,0);
  f.node('#study-speak').click();f.releases.at(-1)();f.playbackFailures.at(-1)();
  assert.match(f.node('#study-speak').textContent,/다시 눌러서 듣기/);
  assert.equal(f.c.FQ.storage.settings().speak,true,'수동으로 듣기를 누르면 읽어 주기를 켠다');
  f.events.offline.forEach(fn=>fn());assert.equal(a.state.game,null);assert.equal(a.state.study.index,0);
  f.node('#study-next').click();assert.equal(a.state.study.index,1);
  f.c.navigator.onLine=true;f.events.online.forEach(fn=>fn());assert.ok(!f.c.listening);
  f.node('#study-next').click();assert.match(f.node('main').innerHTML,/수도 공부를 마쳤어요/);
  assert.deepEqual(progressSnapshot(f),before);
});

test('수도 문제는 큰 🔊 가 수도 이름을 자동으로 한 번 읽고, 보기는 국기 4장(나라 이름 작게)이며 답은 나라 code 로 채점한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital'});f.c.FQ.app.startGame(['mx']);
  const a=f.c.FQ.test,q=a.state.game.current(),html=f.node('main').innerHTML,mx=f.c.FQ.quiz.byCode('mx');
  // 무대는 수도 명패와 듣기를 제공하며 정답인 국기·나라 이름은 노출하지 않는다.
  assert.match(html,/<div class="flag-stage capital-question"><div class="q-label">🏙️ 어느 나라의 수도일까요\?<\/div><div class="capital-plate"><div class="capital-plate-text"><span class="capital-tag">🏙️ 수도<\/span><span class="capital-word">멕시코시티<\/span><\/div><\/div><button class="btn btn-listen capital-listen" id="capital-listen" data-speak="멕시코시티" data-label="🔊 눌러서 들어보기" type="button">🔊 눌러서 들어보기<\/button><\/div>/);
  assert.doesNotMatch(html,/capital-name|muted">멕시코시티/);
  const stage=html.match(/<div class="flag-stage capital-question">[\s\S]*?<div id="feedback-area"[^>]*>/)[0];
  assert.doesNotMatch(stage,/flags\/mx|>멕시코</);
  // 보기: 그림 놀이와 같은 국기 격자 부품, 4장, 나라 중복 없음, 정답 포함, 수도 이름은 보기에 없다.
  assert.match(html,/<div class="answer-grid art-grid">/);
  const choices=html.match(/<button class="answer-btn art-choice" type="button" data-code="[a-z]+"><img src="flags\/[a-z]+\.svg" alt="" width="160" height="120"><span class="art-choice-name">[^<]+<\/span><\/button>/g)||[];
  assert.equal(choices.length,4);
  const codes=choices.map(c=>c.match(/data-code="([a-z]+)"/)[1]);
  assert.equal(new Set(codes).size,4);assert.ok(codes.includes('mx'));
  // 보기에는 수도 이름이 없다(나라 이름만). 어떤 보기의 나라 이름 안에 수도가 들어 있으면(지부티·기니비사우의 비사우·빈센트의 빈) 이 검사로 가릴 수 없어 뺀다.
  for(const c of q.options)if(!q.options.some(o=>o.ko.includes(c.capital)))assert.doesNotMatch(html.slice(html.indexOf('answer-grid')),new RegExp(rx(c.capital)));
  assert.match(html,/id="hint"/);assert.match(html,/id="skip"/);assert.match(html,/id="combo-title">여행 카드 0 \/ 5장</);
  // 자동 낭독: 만나기 카드처럼 마이크 해제 뒤에 수도 이름 한 문구만 읽는다. 실패하면 단추가 '다시 눌러서 듣기'로 바뀐다.
  assert.equal(f.spoken.length,0);f.releases.at(-1)();assert.deepEqual(f.spoken,[['멕시코시티']]);
  f.playbackFailures.at(-1)();assert.equal(f.node('#capital-listen').textContent,'🔊 다시 눌러서 듣기');assert.ok(f.node('#capital-listen').classList.contains('needs-tap'));
  // 단추를 누르면 다시 읽고 라벨이 돌아온다.
  const btn=f.node('#capital-listen');btn.setAttribute('data-speak','멕시코시티');btn.setAttribute('data-label','🔊 눌러서 들어보기');
  f.clickDelegated('[data-speak]',btn);assert.equal(btn.textContent,'🔊 눌러서 들어보기');f.releases.at(-1)();assert.deepEqual(f.spoken.at(-1),['멕시코시티']);
  // 채점은 나라 code. 정답 카드는 수도 명패(큰 글자) + '[국기] 나라의 수도예요'(D29), 읽는 문구는 기존 [수도, 나라의 수도예요].
  const dailyBefore=JSON.stringify(f.c.FQ.storage.daily());
  const clicked=f.node('choice');clicked.setAttribute('data-code','mx');f.clickDelegated('.answer-btn',clicked);
  assert.equal(a.state.answered,true);assert.equal(a.state.game.correct,1);
  const fb=f.node('#feedback-area').innerHTML;
  assert.match(fb,/<div class="capital-plate"><div class="capital-plate-text"><span class="capital-tag">🏙️ 수도<\/span><span class="capital-word">멕시코시티<\/span><\/div><\/div><div class="capital-of"><img class="capital-of-flag" src="flags\/mx\.svg" alt="멕시코 국기"><span class="capital-of-text"><b>멕시코<\/b>의 수도예요<\/span><\/div>/);
  assert.doesNotMatch(fb,/remember-title|remember-art|remember-box|kname/);
  assert.deepEqual([...a.state.lastSpeech.lines],['멕시코시티','멕시코의 수도예요']);
  f.releases.at(-1)();f.runDelay(120);f.finishMusic();assert.deepEqual(f.spoken.at(-1),['멕시코시티','멕시코의 수도예요']);
  // 기록은 axes.capital 에만: 194칸 국기 스티커·오늘의 도전·국기 기록은 그대로다.
  assert.equal(f.c.FQ.storage.allAxisStats('capital').mx.correct,1);assert.equal(f.c.FQ.storage.allAxisStats('capital').mx.seen,1);
  assert.equal(f.c.FQ.storage.allCountryStats().mx,undefined);assert.equal(f.c.FQ.progress.hasSticker('mx'),false);
  assert.equal(a.state.newStickers.length,0);assert.equal(JSON.stringify(f.c.FQ.storage.daily()),dailyBefore);
  assert.equal(f.c.FQ.progress.stickers().owned,0);
  assert.match(f.node('#combo-title').textContent,/여행 카드 1 \/ 5장/,'여행 카드(상자 진도)는 모든 놀이가 쌓는다');
  assert.equal(JSON.stringify(f.c.FQ.test.state.met.map(m=>[m.country.code,m.correct])),'[["mx",true]]');
  assert.equal(JSON.parse(f.c.FQ.storage.exportJson()).axes.capital.mx.correct,1,'내보내기 JSON 에 capital 축');
  // 오답: 수도 기록에 wrong, 국기 오답노트(한 번 더 만나기)는 비어 있다.
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'capital'});g.c.FQ.app.startGame(['mx']);
  const wrong=g.c.FQ.test.state.game.current().options.find(c=>c.code!=='mx').code;
  g.c.FQ.test.submit({code:wrong});
  assert.equal(g.c.FQ.storage.allAxisStats('capital').mx.wrong,1);assert.deepEqual([...g.c.FQ.storage.wrongList()],[]);
  assert.match(g.node('#feedback-area').innerHTML,/<span class="capital-word">멕시코시티<\/span>[\s\S]*<b>멕시코<\/b>의 수도예요/,'오답 카드도 같은 수도 명패');
});

test('수도 퀴즈는 시간 제한과 반복 출제 없이 진행하고 수도 기록과 결과를 따로 남긴다',()=>{
  // 시간 초과: 오답으로 적지 않고 다음 문제로 간다.
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital',timer:10});f.c.FQ.app.startGame(['mx','kr']);
  const a=f.c.FQ.test,first=a.state.game.current().country.code;
  for(let i=0;i<10;i++)f.runDelay(1000);
  // 수도 놀이에는 제한 시간이 없어 10초가 지나도 그대로다(D23).
  assert.equal(f.c.FQ.storage.allAxisStats('capital')[first],undefined);
  assert.equal(a.state.game.index,0);assert.equal(a.state.answered,false);assert.equal(a.state.unscored,0);assert.equal(a.state.timerId,null);
  // 수도 퀴즈는 정답 여부와 관계없이 서로 다른 나라를 한 번씩만 낸다.
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'capital',count:6,level:'all',speak:false});g.c.FQ.app.startGame(null);
  const b=g.c.FQ.test;let seen=[];
  for(let n=0;n<40&&b.state.game&&!b.state.game.isOver();n++){
    const cur=b.state.game.current();if(!cur)break;seen.push(cur.country.code);b.submit(n%2?{code:cur.country.code}:{text:''});b.goNext();
  }
  assert.equal(seen.length,6);assert.equal(b.state.game.againCount,0,'오답도 같은 판에 다시 넣지 않는다');
  assert.equal(new Set(seen).size,6,'6문제 판은 서로 다른 나라 6개를 만난다');
  assert.match(g.node('main').innerHTML,/오늘 만난 나라 6개/,'결과의 만난 나라는 나라 수');
  assert.deepEqual(Object.keys(g.c.FQ.storage.allCountryStats()),[]);
  // 결과: 국기 스티커 없음, 만난 나라는 나라 수, 한 번 더 만날 나라 줄에는 수도 이름.
  const h=fixture();h.c.FQ.storage.updateSettings({mode:'capital',speak:false});h.c.FQ.app.startGame(['mx']);
  h.c.FQ.test.submit({text:''},true);h.c.FQ.test.goNext();
  const res=h.node('main').innerHTML;
  assert.match(res,/aria-label="오늘 만난 나라 1개"/);assert.doesNotMatch(res,/new-sticker-card/);
  assert.match(res,/<div class="wh">🏙️ 멕시코시티<\/div>/);
  assert.equal(h.c.FQ.storage.history()[0].mode,'capital');
  // 홈: 수도 놀이에서 공부와 퀴즈를 고르며 오늘의 도전 안내와 대결 숨김은 유지한다.
  const i=fixture();i.c.FQ.storage.updateSettings({mode:'capital',players:['민규','아빠']});i.c.FQ.app.home();
  const home=i.node('main').innerHTML;
  assert.match(home,/id="play-capital"/);assert.match(home,/class="play-d">공부하기 · 문제 풀기</);
  assert.doesNotMatch(home,/data-mode="capital"|data-mode="capitalVoice"/);
  assert.match(home,/지금 놀이로는 칸이 안 올라가요 · 눌러서 국기 놀이로 바꾸기/);
  assert.doesNotMatch(home,/id="duel"/,'대결 설정은 별도 설정 화면에 있다');
  assert.equal(i.c.FQ.quiz.MODES.capital.label,'수도 듣고 국기 찾기');assert.equal(i.spoken.length,0);
  // 읽어 주는 문구는 전부 수아 음원에 있다: 수도 이름·'나라의 수도예요'. 새 화면 글자는 읽지 않는다.
  const manifest=fs.readFileSync(path.join(root,'js/voice-manifest.js'),'utf8');
  for(const c of f.c.FQ.countries){assert.ok(manifest.includes('"'+c.capital+'"'),c.capital);assert.ok(manifest.includes('"'+c.ko+'의 수도예요"'),c.ko);}
  for(const line of ['눌러서 들어보기','어느 나라의 수도일까요','수도 듣고 국기 찾기','에 있어요'])assert.ok(!manifest.includes('"'+line+'"'),line+' 는 화면 글자일 뿐이다');
});


/* 지도 공부는 채점 상태와 독립적이며, 퀴즈는 한 판에 같은 나라를 반복하지 않는다. */
function startMapStudy(f,codes) {
  f.c.FQ.app.home();
  const pool=f.c.FQ.quiz.pool;
  if(codes)f.c.FQ.quiz.pool=()=>codes.map(code=>f.c.FQ.quiz.byCode(code));
  try { tapPlay(f,'map');f.node('#map-study-start').click(); }
  finally { f.c.FQ.quiz.pool=pool; }
  return f.c.FQ.test;
}

test('지도 메뉴와 공부는 무채점이며 앞뒤 탐색·완료 후 퀴즈를 별도로 선택한다',()=>{
  const f=fixture();f.c.FQ.app.boot();f.c.FQ.storage.updateSettings({count:3,timer:10});
  f.c.FQ.storage.recordAnswer('kr',true,'map');f.c.FQ.storage.recordAnswer('fr',false);
  const before=progressSnapshot(f),a=startMapStudy(f,['kr','jp','cn']),first=a.state.mapStudy.countries[0];
  assert.equal(a.state.game,null);assert.equal(a.state.timerId,null);assert.ok(!f.c.listening);
  assert.equal(f.node('#map-study-prev').disabled,true);f.node('#map-study-prev').click();assert.equal(a.state.mapStudy.index,0);
  const html=f.node('main').innerHTML;
  assert.match(html,/map-world-context/);assert.match(html,/map-region-context/);assert.ok(html.includes(first.continent));
  assert.doesNotMatch(html,/answer-area|id="hint"|id="skip"|timer-chip|travel-chip/);
  assert.match(html,/id="map-study-count">1 \/ 3/);
  f.releases.at(-1)();assert.deepEqual(f.spoken.at(-1),[first.ko,first.fact]);
  f.node('#map-study-next').click();assert.equal(a.state.mapStudy.index,1);
  f.node('#map-study-prev').click();assert.equal(a.state.mapStudy.index,0);
  for(let n=0;n<3;n++)f.node('#map-study-next').click();
  assert.match(f.node('main').innerHTML,/지도 공부를 마쳤어요/);assert.equal(a.state.game,null);
  assert.deepEqual(progressSnapshot(f),before,'정답·점수·도장·상자·게임 기록을 보존한다');
  f.node('#map-study-quiz').click();assert.match(f.node('main').innerHTML,/map-menu/);assert.equal(a.state.game,null);
  f.node('#map-quiz-start').click();assert.equal(a.state.game.current().mode,'map');assert.equal(a.state.mapStudy,null);
  assert.doesNotMatch(f.node('main').innerHTML,/map-study-card|meet-next/);
});

test('지도 공부는 대륙·난이도·개수를 따르고 다음 묶음은 새 나라부터 표시한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({count:3,level:'1',continent:'아시아',speak:false});
  const expected=f.c.FQ.quiz.pool({level:'1',continent:'아시아',axis:'map'}).map(c=>c.code);
  const a=startMapStudy(f),first=[...a.state.mapStudy.countries].map(c=>c.code);
  assert.equal(first.length,3);assert.equal(new Set(first).size,3);assert.ok(first.every(code=>expected.includes(code)));
  for(let n=0;n<3;n++)f.node('#map-study-next').click();f.node('#map-study-more').click();
  const second=[...a.state.mapStudy.countries].map(c=>c.code);
  assert.equal(second.length,3);assert.ok(second.every(code=>!first.includes(code)));
  f.c.FQ.storage.updateSettings({count:'all'});startMapStudy(f);
  assert.equal(a.state.mapStudy.countries.length,expected.length);
  const g=fixture();g.c.FQ.quiz.pool=()=>[];startMapStudy(g);
  assert.match(g.node('main').innerHTML,/지금 조건에 맞는 나라가 없어요/);assert.equal(g.c.FQ.test.state.game,null);
});

test('지도 공부를 이동하거나 떠나면 이전 음성 콜백이 되살아나지 않는다',()=>{
  for(const leave of ['next','menu','home','dex','stats','hidden']) {
    const f=fixture();f.c.FQ.app.boot();const a=startMapStudy(f,['kr','jp']);
    const release=f.releases.at(-1),before=progressSnapshot(f);
    if(leave==='next')f.node('#map-study-next').click();
    if(leave==='menu')f.node('#map-study-back').click();
    if(leave==='home')f.c.FQ.app.home();
    if(leave==='dex')f.node('#nav-dex').click();
    if(leave==='stats')f.node('#nav-stats').click();
    if(leave==='hidden'){f.c.document.hidden=true;f.events.visibilitychange.forEach(fn=>fn());}
    const html=f.node('main').innerHTML;release();f.runDelay(900);f.runDelay(1800);
    assert.equal(f.spoken.length,0,leave);assert.ok(!f.c.listening,leave);assert.equal(a.state.game,null,leave);
    assert.equal(f.node('main').innerHTML,html,leave);assert.deepEqual(progressSnapshot(f),before,leave);
  }
});

test('오프라인 지도 공부는 음원 실패에도 진행되고 퀴즈의 위치 설명과 다시 공부가 기록을 보존한다',()=>{
  const f=fixture();f.c.navigator.onLine=false;f.c.FQ.app.boot();f.c.FQ.storage.updateSettings({speak:false});
  const a=startMapStudy(f,['kr','jp']),before=progressSnapshot(f);
  f.node('#map-study-speak').click();f.releases.at(-1)();f.playbackFailures.at(-1)();
  assert.match(f.node('#map-study-speak').textContent,/다시 눌러서 듣기/);
  f.events.offline.forEach(fn=>fn());f.node('#map-study-next').click();assert.equal(a.state.mapStudy.index,1);
  assert.deepEqual(progressSnapshot(f),before);
  f.c.FQ.storage.updateSettings({mode:'map',speak:false});f.c.FQ.app.startGame(['kr','jp']);
  const order=[];
  for(let n=0;n<2;n++) {
    const q=a.state.game.current();order.push(q.country.code);a.submit({text:''},true);
    assert.match(f.node('#feedback-area').innerHTML,/map-world-context/);
    assert.match(f.node('#feedback-area').innerHTML,/map-region-context/);
    assert.equal(f.c.document.activeElement,f.node('#feedback-area'));
    assert.equal(f.node('#feedback-area').focusOptions.preventScroll,true);
    assert.equal(f.node('#feedback-area').scrollOptions.block,'start');a.goNext();
  }
  assert.equal(new Set(order).size,2);assert.equal(a.state.game.againCount,0);
  assert.match(f.node('main').innerHTML,/id="map-result-study"/);
  const after=progressSnapshot(f);f.node('#map-result-study').click();
  assert.deepEqual([...a.state.mapStudy.countries].map(c=>c.code).sort(),order.sort());
  assert.deepEqual(progressSnapshot(f),after);assert.equal(a.state.game,null);
});

test('지도 확대는 채점·보기·좌표를 바꾸지 않고 세계 전체로 돌아온다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'map',speak:false});f.c.FQ.app.startGame(['kr','jp']);
  const a=f.c.FQ.test,q=a.state.game.current(),before=progressSnapshot(f),area=f.node('#answer-area').innerHTML;
  const viewport=f.node('#map-scroll');viewport.scrollWidth=600;viewport.clientWidth=300;
  f.node('#map-zoom').click();
  assert.equal(f.node('#map-zoom').attrs['aria-pressed'],'true');assert.equal(viewport.scrollLeft,150);
  assert.ok(f.node('.map-explorer').classList.contains('is-zoomed'));assert.equal(a.state.game.current(),q);
  assert.equal(f.node('#answer-area').innerHTML,area);assert.deepEqual(progressSnapshot(f),before);
  f.node('#map-zoom').click();assert.equal(viewport.scrollLeft,0);assert.equal(f.node('#map-zoom').attrs['aria-pressed'],'false');
  assert.equal(f.node('.map-explorer').classList.contains('is-zoomed'),false);
});
console.log('앱 흐름 회귀 검사 '+passed+'건 통과');
