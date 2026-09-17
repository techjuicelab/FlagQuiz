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
  // 깜짝 상자 난수는 기본으로 고정한다(굴림 0.99 → 8장째 보장 전에는 안 열림, 종류 보통·흔들기 없음). 상자를 보려는 검사만 덮어쓴다.
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
// 그림·명소 놀이에서 처음 만나는 나라는 만나기 카드가 먼저 뜬다. 문제 화면이 필요한 검사는 카드를 넘긴다.
function meetNext(f){if(f.node('main').innerHTML.includes('id="meet-next"'))f.node('#meet-next').click();}
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
  a.submit({code:a.state.game.current().country.code});f.releases[0]();
  f.c.FQ.app.home();f.runDelay(180);
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
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital'});f.c.FQ.app.startGame(['kr']);meetNext(f);
  const target=f.node('name-audio');target.setAttribute('data-speak','대한민국');
  f.clickDelegated('[data-speak]',target);const name=f.releases.at(-1);
  f.c.FQ.test.submit({code:'kr'});name();assert.equal(f.spoken.length,0);
  f.releases.at(-1)();f.runDelay(180);f.finishMusic();
  assert.equal(f.spoken.length,1);assert.equal(f.spoken[0][0],'서울');
});

test('오답과 건너뛰기는 이름 한 번과 국기 특징 하나만 다정하게 알려 준다',()=>{
  for(const mode of ['choice4','reverse','voice','typing'])for(const gaveUp of [false,true]){
    const f=fixture();f.c.FQ.storage.updateSettings({mode});f.c.FQ.app.startGame(['kr']);meetNext(f);
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
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital'});f.c.FQ.app.startGame(['kr']);meetNext(f);
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
  // 검사용 난수: 다섯째 카드에서만 열리고(보통 상자, 흔들기 없음) 그 전에는 열리지 않는다.
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
  assert.match(f.node('created').innerHTML,/깜짝 상자를 찾았어요!/);
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
  const f=fixture();f.c.FQ.storage.addXp(295);const a=f.startVoice(['kr']);
  a.submit({code:'kr'});f.releases.at(-1)();assert.equal(f.music.at(-1).event,'level');
  const g=fixture(),b=g.startVoice(['kr']);b.submit({code:'kr'});g.releases.at(-1)();
  assert.equal(g.music.at(-1).event,'sticker');
  const h=fixture();for(let i=0;i<4;i++){h.c.FQ.storage.recordAnswer('jp',false);h.c.FQ.storage.recordChest(null);}
  h.c.FQ.storage.addXp(295);const c=h.startVoice(['kr']);c.state.rng=()=>0;c.state.rngKind=()=>0.5;c.submit({code:'kr'});h.releases.at(-1)();
  assert.equal(h.music.length,0);h.finishVoice();assert.equal(h.music.at(-1).event,'chest');
});

test('정답 전용 음악과 홈 배경음은 기본 꺼짐이며 선택하면 사용할 수 있다',()=>{
  const f=fixture();assert.equal(f.c.FQ.storage.settings().correctMusic,false);assert.equal(f.c.FQ.storage.settings().homeMusic,false);
  f.c.FQ.storage.recordAnswer('kr',true);const a=f.startVoice(['kr']);a.submit({code:'kr'});f.releases.at(-1)();
  assert.equal(f.music.at(-1).event,'discovery');
  f.c.FQ.storage.updateSettings({correctMusic:true});f.c.FQ.app.startGame(['kr']);meetNext(f);a.submit({code:'kr'});f.releases.at(-1)();
  assert.equal(f.music.at(-1).event,'correct');
  f.c.FQ.storage.updateSettings({homeMusic:true});f.c.FQ.app.home();f.releases.at(-1)();assert.equal(f.music.at(-1).event,'homeBgm');
  f.c.FQ.app.startGame(['kr']);meetNext(f);assert.equal(f.music.at(-1).cancelled,true);
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
    if(action==='quiz')f.c.FQ.app.startGame(['kr']);meetNext(f);
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
    f.c.FQ.app.startGame(['kr']);meetNext(f);const a=f.c.FQ.test,q=a.state.game.current();
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
    f.c.FQ.storage.updateSettings({mode});f.c.FQ.app.startGame(['kr']);meetNext(f);
    assert.equal(f.c.FQ.test.state.game.current().mode,'choice4');
  }
});

test('두 그림 퀴즈는 실제 그림 경로·4개 보기·별도 기록·기존 fact 음원을 사용한다',()=>{
  for(const mode of ['symbol','place']) {
    const f=fixture();f.c.FQ.storage.updateSettings({mode,dev:{art:true}});f.c.FQ.app.home();
    assert.match(f.node('main').innerHTML,new RegExp('data-mode="'+mode+'"'));
    f.c.FQ.app.startGame(['kr']);meetNext(f);const a=f.c.FQ.test,q=a.state.game.current();
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

test('처음 만나는 그림은 채점 전에 만나기 카드로 나라 이름과 그림 이름을 먼저 들려준다',()=>{
  for(const mode of ['symbol','place']) {
    const f=fixture();f.c.FQ.storage.updateSettings({mode,timer:10,dev:{art:true}});f.c.FQ.app.startGame(['kr']);
    const a=f.c.FQ.test,q=a.state.game.current(),artName=f.c.FQ.subjects.kr[mode].ko;
    let html=f.node('main').innerHTML;
    assert.match(html,/id="meet-next"/);assert.match(html,/id="answer-area" hidden/);
    assert.ok(!a.state.timerId,'만나기 카드에서는 제한 시간이 돌지 않는다');
    f.releases.at(-1)();
    assert.deepEqual(f.spoken.at(-1),[q.country.ko,artName],'나라 이름과 그림 이름을 이어서 읽는다');
    a.submit({code:'kr'});
    assert.equal(a.state.answered,false,'카드가 떠 있는 동안은 채점하지 않는다');
    assert.equal(Object.keys(f.c.FQ.storage.allAxisStats(mode)).length,0,'만나기 카드는 기록을 만들지 않는다');
    f.node('#meet-next').click();
    html=f.node('main').innerHTML;
    assert.doesNotMatch(html,/id="meet-next"/);
    assert.equal((html.match(/class="answer-btn art-choice"/g)||[]).length,4);
    f.node('#question-art').handlers.load();a.submit({code:'kr'});f.releases.at(-1)();f.finishMusic();
    assert.equal(f.c.FQ.storage.axisStat(mode,'kr').seen,1);
    // 한 번 만난 나라는 다음 판부터 카드 없이 바로 문제로 나온다.
    f.c.FQ.app.startGame(['kr']);
    assert.doesNotMatch(f.node('main').innerHTML,/id="meet-next"/);
  }
});

test('그림 다운로드 실패를 오답으로 기록하지 않고 다시 받은 뒤에만 제출한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});f.c.FQ.app.startGame(['kr']);meetNext(f);
  const a=f.c.FQ.test,img=f.node('#question-art');
  img.handlers.error();a.submit({code:'kr'});a.submit({text:''},true);
  assert.equal(f.c.FQ.storage.stats().asked,0);assert.equal(a.state.answered,false);
  f.node('#art-retry').click();assert.equal(img.src,'images/symbols/kr.webp');
  img.handlers.load();a.submit({code:'kr'});
  assert.equal(f.c.FQ.storage.axisStat('symbol','kr').seen,1);
});

test('느린 그림 다운로드 중에는 제출이 시작되지 않고, 새 축에는 제한 시간이 없다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',timer:10,dev:{art:true}});f.c.FQ.app.startGame(['kr']);meetNext(f);
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
  f.c.FQ.storage.updateSettings({mode:'symbol',timer:10,dev:{art:true}});f.c.FQ.app.startGame(['kr']);meetNext(f);
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
  f.c.FQ.storage.updateSettings({mode:'place',timer:10,dev:{art:true}});f.c.FQ.app.startGame(['kr']);meetNext(f);
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
  f.c.FQ.storage.updateSettings({mode:'typing'});f.c.FQ.app.home();
  f.node('#review').click();
  assert.equal(f.c.FQ.storage.settings().mode,'typing');
  assert.equal(f.c.FQ.test.state.game.current().mode,'typing');

  const g=fixture();g.c.FQ.storage.recordAnswer('jp',false);
  g.c.FQ.storage.updateSettings({mode:'map'});g.c.FQ.app.home();
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
    meetNext(f);
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
const css = fs.readFileSync(path.join(root,'css/style.css'),'utf8');

/** 홈의 놀이 단추·알약은 ui.on 위임이라 delegated 로 누른다. 가짜 요소에 data-* 만 실어 보낸다. */
function tapPlay(f,tile){const t=f.node('play:'+tile);t.setAttribute('data-play',tile);f.clickDelegated('[data-play]',t);}
function tapPill(f,mode){const t=f.node('pill:'+mode);t.setAttribute('data-mode',mode);f.clickDelegated('[data-mode]',t);}
function playOrder(html){return [...html.matchAll(/data-play="([a-z]+)"/g)].map(m=>m[1]);}
function modeOrder(html){return [...html.matchAll(/data-mode="([a-z0-9]+)"/g)].map(m=>m[1]);}

test('첫 화면은 큰 놀이 단추 4개와 세부 알약 6개뿐이고 순서는 늘 같다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'choice4',dev:{art:true}});f.c.FQ.app.home();
  const html=f.node('main').innerHTML;
  assert.deepEqual(playOrder(html),['flag','art','map','capital']);
  assert.deepEqual(modeOrder(html),['choice4','reverse','voice','typing','symbol','place']);
  for(const id of ['play-flag','play-art','play-map','play-capital'])assert.match(html,new RegExp('id="'+id+'"'));
  // 별도 '시작하기'는 없다. 이름·난이도·설정은 아빠 설정 패널 안에 접혀(hidden) 있다.
  assert.doesNotMatch(html,/id="start"|어떻게 맞힐까요|mode-group/);
  assert.match(html,/<div class="dad-panel" id="dad-panel" hidden>/);
  const panel=html.slice(html.indexOf('id="dad-panel"'));
  for(const id of ['p1','duel','opt-sound','opt-speak','opt-bgm','opt-correct-music','opt-review'])assert.match(panel,new RegExp('id="'+id+'"'),id);
  for(const attr of ['data-level','data-continent','data-count','data-timer','data-cont-go'])assert.match(panel,new RegExp(attr),attr);
  assert.ok(html.indexOf('id="play-flag"')<html.indexOf('id="dad-open"'),'놀이 단추가 아빠 설정보다 위');
  assert.ok(html.indexOf('id="travel-row"')>html.indexOf('id="play-capital"')&&html.indexOf('id="travel-row"')<html.indexOf('id="dad-open"'),'여행 카드 줄은 단추 아래·설정 위');
  assert.equal((html.match(/class="travel-slot(?: filled)?"/g)||[]).length,5);
  // 마지막에 고른 놀이는 선택 표시만 — 자리는 그대로다.
  assert.match(html,/id="play-flag"[^>]*aria-pressed="true"/);assert.match(html,/data-mode="choice4" aria-pressed="true"/);
  f.c.FQ.storage.updateSettings({mode:'place'});f.c.FQ.app.home();
  const html2=f.node('main').innerHTML;
  assert.deepEqual(playOrder(html2),['flag','art','map','capital']);assert.deepEqual(modeOrder(html2),modeOrder(html));
  assert.match(html2,/id="play-art"[^>]*aria-pressed="true"/);assert.match(html2,/id="play-flag"[^>]*aria-pressed="false"/);
  assert.match(html2,/data-mode="place" aria-pressed="true"/);
  assert.match(html2,/id="play-art"[\s\S]*?class="play-d">명소 보고 나라 고르기</,'그림 단추 설명은 지금 고른 세부 놀이');
  // 그림 기능을 끄면 그림 단추가 통째로 빠져 3개만 남는다.
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'map',dev:{art:false}});g.c.FQ.app.home();
  assert.deepEqual(playOrder(g.node('main').innerHTML),['flag','map','capital']);
  assert.doesNotMatch(g.node('main').innerHTML,/data-mode="symbol"|data-mode="place"|play-art/);
  // 크기: 폰 단추 120px 이상, 아이패드 220px 이상, 알약 44px 이상.
  assert.match(css,/\.home-kid \{[^}]*--play-min: 120px/);assert.match(css,/\.play-btn \{[^}]*min-height: var\(--play-min\)/);
  assert.match(css,/@media \(min-width: 744px\) \{\s*\.home-kid \{[^}]*--play-min: 220px/);
  assert.match(css,/\.play-pill \{[^}]*min-height: 44px/);assert.match(css,/\.dad-open \{[^}]*min-height: 48px/);
  assert.match(css,/\.dad-panel\[hidden\] \{ display: none; \}/);
  assert.match(css,/@media \(min-width: 1000px\) and \(orientation: landscape\) \{\s*\.home-kid \{[^}]*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\)/);
});

test('놀이 단추와 알약을 누르면 바로 시작하고 고른 세부 놀이를 단추별로 기억한다',()=>{
  const f=fixture(),a=f.c.FQ.test;f.c.FQ.storage.updateSettings({dev:{art:true}});f.c.FQ.app.home();
  tapPlay(f,'flag');
  assert.ok(a.state.game,'큰 단추만 눌러도 놀이가 시작된다');assert.equal(a.state.game.current().mode,'choice4');
  assert.equal(f.c.FQ.storage.settings().mode,'choice4');assert.equal(f.c.FQ.storage.settings().lastMode.flag,'choice4');
  f.c.FQ.app.home();tapPill(f,'voice');
  assert.equal(a.state.game.current().mode,'voice');assert.equal(f.c.FQ.storage.settings().mode,'voice');
  assert.equal(f.c.FQ.storage.settings().lastMode.flag,'voice');
  // 다른 놀이를 하고 돌아와도 국기 단추는 마지막 국기 세부 놀이(말하기)로 간다.
  f.c.FQ.app.home();tapPill(f,'place');meetNext(f);
  assert.equal(a.state.game.current().mode,'place');assert.deepEqual({...f.c.FQ.storage.settings().lastMode},{flag:'voice',art:'place'});
  f.c.FQ.app.home();
  assert.match(f.node('main').innerHTML,/id="play-flag"[\s\S]*?class="play-d">말로 답하기</);
  tapPlay(f,'flag');assert.equal(a.state.game.current().mode,'voice');
  f.c.FQ.app.home();tapPlay(f,'art');meetNext(f);assert.equal(a.state.game.current().mode,'place');
  f.c.FQ.app.home();tapPlay(f,'map');meetNext(f);assert.equal(a.state.game.current().mode,'map');
  f.c.FQ.app.home();tapPlay(f,'capital');assert.equal(a.state.game.current().mode,'capital');
  // 저장된 조건(난이도·대륙·문제 수·제한 시간)은 그대로 쓴다.
  f.c.FQ.app.home();f.c.FQ.storage.updateSettings({count:5,timer:10,continent:'아시아'});f.c.FQ.app.home();
  tapPill(f,'choice4');assert.equal(a.state.game.total,5);assert.ok(a.state.timerId,'제한 시간이 돈다');
  assert.ok(a.state.game.questions.every(q=>q.country.continent==='아시아'));
  // 그림 기능이 꺼져 있으면 그림 알약을 눌러도 시작하지 않는다.
  const g=fixture();g.c.FQ.storage.updateSettings({dev:{art:false}});g.c.FQ.app.home();
  tapPill(g,'symbol');assert.equal(g.c.FQ.test.state.game,null);tapPlay(g,'art');assert.equal(g.c.FQ.test.state.game,null);
});

test('아빠 설정은 600ms 길게 눌러야 열리고, 짧게 누르면 안내만 바뀌며, 홈을 다시 그리면 닫힌다',()=>{
  const f=fixture(),a=f.c.FQ.test;f.c.FQ.app.home();
  const opener=f.node('#dad-open'),panel=f.node('#dad-panel');
  assert.equal(a.state.dadOpen,false);assert.notEqual(panel.hidden,false);
  // 짧게 누르기(click 만): 열리지 않고 글자 안내만. 읽어 주지 않는다 — 수아 음원에 없는 문구다.
  opener.handlers.click();
  assert.equal(a.state.dadOpen,false);assert.notEqual(panel.hidden,false);
  assert.equal(f.node('#dad-hint').textContent,'길게 눌러 주세요');assert.equal(f.spoken.length,0);
  f.runDelay(1400);assert.equal(f.node('#dad-hint').textContent,'길게 눌러 열어요');
  // 누르다 600ms 전에 떼면 열리지 않는다.
  opener.handlers.touchstart({touches:[{clientX:10,clientY:10}]});opener.handlers.touchend();f.runDelay(600);
  assert.equal(a.state.dadOpen,false);
  // 손가락이 12px 넘게 움직여도(스크롤) 열리지 않는다.
  opener.handlers.touchstart({touches:[{clientX:10,clientY:10}]});opener.handlers.touchmove({touches:[{clientX:10,clientY:40}]});f.runDelay(600);
  assert.equal(a.state.dadOpen,false);
  // 600ms 를 채우면 열린다. 뒤따르는 click 은 안내를 바꾸지 않는다.
  opener.handlers.touchstart({touches:[{clientX:10,clientY:10}]});f.runDelay(600);
  assert.equal(a.state.dadOpen,true);assert.equal(panel.hidden,false);assert.equal(opener.attrs['aria-expanded'],'true');
  opener.handlers.click();assert.equal(f.node('#dad-hint').textContent,'열렸어요');
  // 패널 안에서 조건을 바꾸면 다시 그려도 열린 채다.
  const lv=f.node('lv2');lv.setAttribute('data-level','2');f.clickDelegated('[data-level]',lv);
  assert.equal(f.c.FQ.storage.settings().level,'2');assert.equal(a.state.dadOpen,true);
  assert.match(f.node('main').innerHTML,/<div class="dad-panel" id="dad-panel">/);
  // 홈을 새로 그리면(놀이 뒤 돌아오기 등) 닫힌다. 열림은 저장하지 않는다.
  f.c.FQ.app.home();
  assert.equal(a.state.dadOpen,false);assert.match(f.node('main').innerHTML,/id="dad-panel" hidden>/);
  assert.equal(JSON.stringify(f.c.FQ.storage.settings()).includes('dadOpen'),false);
  // 설정 닫기 단추도 닫는다.
  f.node('#dad-open').handlers.touchstart();f.runDelay(600);assert.equal(a.state.dadOpen,true);
  f.node('#dad-close').click();assert.equal(a.state.dadOpen,false);
});

test('둘이서 대결은 국기 놀이에서만 — 그림·명소·지도·수도에서는 스위치를 감추고 켜져 있어도 혼자 논다',()=>{
  for(const mode of ['symbol','place','map','capital']){
    const f=fixture();f.c.FQ.storage.updateSettings({mode,players:['민규','아빠'],dev:{art:true}});f.c.FQ.app.home();
    const html=f.node('main').innerHTML;
    assert.match(html,/class="switch hidden" id="duel-switch"/,mode);
    assert.match(html,/id="duel-off-note"/,mode);
    assert.match(html,/id="p2-field" style/,mode);assert.match(html,/class="field hidden" id="p2-field"/,mode);
    // 가짜 DOM 은 checked 를 HTML 에서 읽지 않는다. 실제 화면처럼 스위치가 켜진 채 숨겨진 상태를 만든다.
    f.node('#duel').checked=true;f.node('#p1').value='민규';f.node('#p2').value='아빠';
    tapPlay(f,mode==='map'||mode==='capital'?mode:'art');meetNext(f);
    const a=f.c.FQ.test;
    assert.deepEqual([...a.state.game.players],['민규'],mode);
    assert.doesNotMatch(f.node('main').innerHTML,/chip turn/,mode);
    // 저장된 두 이름은 그대로라, 국기 놀이로 돌아오면 대결이 다시 켜져 있다.
    assert.deepEqual([...f.c.FQ.storage.settings().players],['민규','아빠'],mode);
  }
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'choice4',players:['민규','아빠']});g.c.FQ.app.home();
  assert.match(g.node('main').innerHTML,/class="switch" id="duel-switch"/);
  assert.doesNotMatch(g.node('main').innerHTML,/duel-off-note/);
  g.node('#duel').checked=true;g.node('#p1').value='민규';g.node('#p2').value='아빠';
  tapPlay(g,'flag');
  assert.deepEqual([...g.c.FQ.test.state.game.players],['민규','아빠']);
  assert.match(g.node('main').innerHTML,/chip turn/);
});

test('그림을 못 받아 지나간 문제는 총 문항·정답률·기록·나라 수 어디에도 세지 않는다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});
  f.c.FQ.app.startGame(['kr','jp','fr','de','it','es']);
  const a=f.c.FQ.test,g=a.state.game;
  const scored=new Set();let submitted=0,skipped=0;
  while(a.state.game&&!a.state.game.isOver()){
    meetNext(f);
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
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});f.c.FQ.app.startGame(['kr']);meetNext(f);
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
  assert.match(css,/\.art-error-emoji \{[^}]*font-size:\s*4/);
});

test('힌트는 정답을 노출하지 않고, 수도 힌트는 첫 글자 대신 국기·대륙 단서를 준다',()=>{
  // '레바논 삼나무'처럼 소재 이름에 나라 이름이 들어 있으면 그 줄을 뺀다.
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});f.c.FQ.app.startGame(['lb']);meetNext(f);
  f.node('#question-art').handlers.load();f.node('#hint').click();
  const hint=f.node('#hint-area').innerHTML;
  assert.doesNotMatch(hint,/레바논/);assert.match(hint,/아시아에 있는 나라예요/);
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});g.c.FQ.app.startGame(['kr']);meetNext(g);
  g.node('#question-art').handlers.load();g.node('#hint').click();
  assert.match(g.node('#hint-area').innerHTML,new RegExp(g.c.FQ.subjects.kr.symbol.ko));
  // 수도(2026-09-17 뒤집기): 보기가 국기라 국기 힌트는 곧 정답이다. 대륙·지역 단서 + 오답 2개 지우기 + 수도 이름 다시 읽기(기존 음원).
  const h=fixture();h.c.FQ.storage.updateSettings({mode:'capital'});h.c.FQ.app.startGame(['kr']);meetNext(h);
  const heardBefore=h.releases.length;h.node('#hint').click();
  const cap=h.node('#hint-area').innerHTML,kr=h.c.FQ.quiz.byCode('kr');
  assert.doesNotMatch(cap,/첫 글자|로 시작해요| 에 있|🚩/);
  assert.doesNotMatch(cap,new RegExp(rx(kr.flagHint)));assert.match(cap,/🗺️ 아시아 · 동아시아에 있어요/);
  assert.equal(h.c.FQ.test.state.removed.length,2,'오답 두 개를 지운다');
  assert.equal(h.releases.length,heardBefore+1);h.releases.at(-1)();assert.deepEqual(h.spoken.at(-1),['서울']);
  const i=fixture();i.c.FQ.storage.updateSettings({mode:'choice4'});i.c.FQ.app.startGame(['kr']);i.node('#hint').click();
  assert.match(i.node('#hint-area').innerHTML,/아시아에 있고/);
});

test('새 축에서 한 번 더 만나기로 잡힌 나라는 결과 카드에 글자로만 알린다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true},speak:false});
  f.c.FQ.app.startGame(['kr','jp','fr','de','it']);meetNext(f);
  const a=f.c.FQ.test;f.node('#question-art').handlers.load();a.submit({code:'kr'});
  assert.match(f.node('#feedback-area').innerHTML,/조금 뒤에 한 번 더 만나요/);
  assert.equal(f.spoken.length,0);
});

test('만나기 카드와 그림 보기는 아이패드 가로·세로에서 한 화면에 들어오는 css 를 갖는다',()=>{
  const landscape=css.slice(css.indexOf('@media (min-width: 760px) and (orientation: landscape) {\n  .quiz-body.meet-quiz'));
  assert.match(landscape,/\.quiz-body\.meet-quiz \{ display: block; \}/);
  assert.match(landscape,/\.quiz-body \.meet-card \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(landscape,/\.quiz-body \.meet-card \.q-label \{[^}]*grid-column: 1 \/ -1/);
  assert.match(css,/img#question-art \{[^}]*max-height:\s*34vh/);
  assert.match(css,/\.art-question img#question-art\[hidden\] \{ display: none; \}/);
  assert.match(css,/\.country-art img\[hidden\] \{ display: none; \}/);
  assert.match(css,/\.btn-sm \{[^}]*min-height:\s*44px/);
  assert.match(css,/\.art-choice img \{[^}]*width:\s*100%; max-width: 200px; min-width: 96px;[^}]*border:\s*1px solid var\(--line\)/);
  assert.match(css,/\.stat \.k \{[^}]*word-break:\s*keep-all/);
  // 만나기 카드의 그림은 감싸는 칸 안에 있고 이름·단추는 따로 묶인다(가로 두 칸 배치의 전제).
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'place',dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  const html=f.node('main').innerHTML;
  assert.match(html,/class="quiz-body meet-quiz"/);
  assert.match(html,/<div class="meet-art"><img id="question-art"/);
  assert.match(html,/<div class="meet-body"><div class="big-name">[\s\S]*id="meet-next"[\s\S]*<\/div><\/div>/);
  meetNext(f);
  assert.doesNotMatch(f.node('main').innerHTML,/meet-quiz|meet-art/);
});

/* ---- 2026-09-17 문제 화면·정답 카드·지도·결과 시안 ---- */
const mapCss=fs.readFileSync(path.join(root,'css/map.css'),'utf8');

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
  // 지도 svg 는 판을 꽉 채우도록 비율 고정을 푼다(폰 세로 확대의 전제). 핀 좌표는 map.js 그대로다.
  assert.equal(f.node('.map-land').attrs.preserveAspectRatio,'none');
  assert.equal((html.match(/class="map-pin answer-btn"/g)||[]).length,4);
  // 새로 읽어 주는 문구는 없다 — 문제를 열 때 읽는 것은 없고, 단추 라벨은 화면 글자다.
  assert.equal(f.spoken.length,0);
  // css: 지시문 흐린 작은 글자, 🔊 폰 56px·아이패드 64px 노란 바탕 진한 글자, 힌트·몰라요 56px·아이패드 60px
  assert.match(css,/\.flag-stage \.q-label \{ font-size: \.88rem;[^}]*color: var\(--text-soft\)/);
  assert.match(css,/\.btn-listen \{[^}]*min-height: 56px;[^}]*background: var\(--accent\); color: #1f2937/);
  assert.match(css,/@media \(min-width: 744px\) \{[^@]*\.btn-listen \{ min-height: 64px/);
  assert.match(css,/\.btn-tool \{[^}]*min-height: 56px/);
  assert.match(css,/@media \(min-width: 744px\) \{[^@]*\.btn-tool \{ min-height: 60px/);
  assert.match(css,/\.tool-row \{[^}]*grid-template-columns: 1fr 1fr/);
  assert.match(css,/\.kid-head \.head-back \{[^}]*min-height: 44px/);
  assert.match(css,/\.kid-head \.chip \{ min-height: 44px/);
  assert.match(css,/\.kid-head \.lv-chip \{ display: none; \}/);assert.match(css,/@media \(min-width: 744px\) \{[^@]*\.kid-head \.lv-chip \{ display: inline-flex; \}/);
  // 폰에서는 카드 수 글자와 🎁 를 눈에서만 감춘다(한 줄에 들어가야 한다). 읽어 주는 기계와 검사는 #combo-title 글자를 그대로 본다.
  assert.match(css,/\.kid-head \.travel-chip \.combo-title \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect\(0 0 0 0\)/);
  assert.match(css,/\.kid-head \.travel-gift \{ display: none; \}/);
  assert.match(css,/@media \(min-width: 744px\) \{[^@]*\.kid-head \.travel-chip \.combo-title \{ position: static/);
});

test('그림·명소 보기는 국기가 주인공인 2×2 격자이고 만나기 카드도 같은 어휘(🔊 56px·노란 64px)를 쓴다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  let html=f.node('main').innerHTML;
  assert.match(html,/<button class="btn btn-listen btn-listen-soft" id="meet-speak" data-speak="대한민국"/);
  assert.match(html,/<button class="btn btn-big btn-go btn-yellow" id="meet-next" type="button">문제 풀어 볼게요 →<\/button>/);
  assert.match(html,/<div class="meet-caption">/);
  meetNext(f);html=f.node('main').innerHTML;
  assert.match(html,/<div class="answer-grid art-grid">/);
  assert.equal((html.match(/<button class="answer-btn art-choice" type="button" data-code="[a-z]+"><img src="flags\/[a-z]+\.svg" alt="" width="160" height="120"><span class="art-choice-name">[^<]+<\/span><\/button>/g)||[]).length,4);
  assert.match(html,new RegExp('<button class="btn btn-listen" data-speak="'+rx(f.c.FQ.subjects.kr.symbol.ko)+'" type="button">🔊 들어보기</button>'));
  assert.match(css,/\.answer-grid\.art-grid \{ grid-template-columns: 1fr 1fr/);
  assert.match(css,/\.art-choice \{ display: flex; flex-direction: column/);
  assert.match(css,/@media \(min-width: 744px\) \{[^@]*\.art-choice img \{ max-width: 300px; min-width: 200px/);
  assert.match(css,/\.btn-go \{[^}]*min-height: 64px/);
  assert.match(css,/\.btn-yellow \{ background: var\(--accent\); color: #1f2937/);
  assert.match(css,/\.btn-listen-soft \{[^}]*border: 2px solid var\(--accent\)/);
  assert.match(css,/\.meet-card \.meet-caption \{[^}]*min-height: 44px/);
  // 그림 오류 상자가 보이는 동안 큰 🔊 는 감춘다(이름 듣기 하나만 남긴다).
  assert.match(css,/\.art-question:has\(> \.art-error:not\(\[hidden\]\)\) > \.btn-listen \{ display: none; \}/);
});

test('정답 카드는 국기 전폭·큰 이름·노란 상자·🔊 56px·다음 64px 이고 폰에서는 무대와 보기를 접는다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',dev:{art:true}});f.c.FQ.app.startGame(['kr','jp']);meetNext(f);
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
  // 수도·지도·국기 모드의 상자 문구 — 수도는 국기 + 나라 이름, 상자에 '🏙️ 수도 · 나라의 수도예요'(2026-09-17 뒤집기).
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'capital'});g.c.FQ.app.startGame(['kr']);meetNext(g);g.c.FQ.test.submit({code:'jp'});
  assert.match(g.node('#feedback-area').innerHTML,/<img class="fb-flag" src="flags\/kr\.svg" alt="대한민국 국기"><div class="kname">대한민국<\/div>[\s\S]*<div class="remember-hint"><span class="remember-body">🏙️ 서울 · 대한민국의 수도예요<\/span><\/div>/);
  assert.deepEqual([...g.c.FQ.test.state.lastSpeech.lines],['서울','대한민국의 수도예요']);
  const h=fixture();h.c.FQ.storage.updateSettings({mode:'map'});h.c.FQ.app.startGame(['kr']);h.c.FQ.test.submit({code:'kr'});
  assert.match(h.node('#feedback-area').innerHTML,new RegExp('<b class="remember-title">🗺️ 아시아 · 동아시아</b><span class="remember-body">'+rx(kr.fact)+'</span>'));
  const i=fixture();i.c.FQ.storage.updateSettings({mode:'choice4'});i.c.FQ.app.startGame(['kr']);i.c.FQ.test.submit({text:''},true);
  assert.match(i.node('#feedback-area').innerHTML,new RegExp('<div class="remember-hint"><span class="remember-body">🚩 '+rx(kr.flagHint)+'</span></div>'));
  assert.equal(JSON.stringify(i.c.FQ.test.state.met.map(m=>[m.country.code,m.correct])),'[["kr",false]]');
  // css: 폰은 무대·보기를 접고, 아이패드 세로·가로는 보기(지도 핀)를 남긴다. 국기 전폭, 이름 34px(2.1rem) 900.
  assert.match(css,/@media \(max-width: 743px\) \{\s*\.quiz-screen\.answered \.quiz-stage-col > \.flag-stage \{ display: none; \}\s*\.quiz-screen\.answered \.quiz-answer-col \{ display: none; \}/);
  assert.match(css,/@media \(min-width: 744px\) and \(orientation: portrait\) \{[^@]*\.quiz-screen\.answered #feedback-area \{ order: 3; \}/,'아이패드 세로는 무대·지도·보기 아래에 카드가 붙는다');
  assert.match(css,/@media \(min-width: 760px\) and \(orientation: landscape\) \{[^@]*\.quiz-screen\.answered \.quiz-stage-col > \.flag-stage \{ display: none; \}/,'아이패드 가로는 무대만 접고 보기(지도 핀)는 남긴다');
  assert.doesNotMatch(css.slice(css.indexOf('@media (min-width: 744px) and (orientation: portrait) {\n  .quiz-screen.answered')),/\.quiz-screen\.answered \.quiz-answer-col \{ display: none/);
  assert.match(css,/\.discovery-card \.name-row img\.fb-flag \{ width: 100%/);
  assert.match(css,/\.discovery-card \.kname \{ font-size: 2\.1rem; font-weight: 900/);
  assert.match(css,/\.discovery-card \.remember-box \{[^}]*border-left: 6px solid var\(--accent\)/);
  assert.match(css,/@media \(prefers-color-scheme: dark\) \{ \.discovery-card \.remember-title \{ color: #ffd97a; \} \}/);
  assert.match(css,/@media \(prefers-color-scheme: dark\) \{ \.btn-listen-soft \{ background: #3a2f14; color: var\(--text\); \} \}/);
});

test('지도판은 폰 세로에서 위아래로 늘고 핀은 44px 기본에 넓은 화면에서 52·56px 이며 아이패드 세로는 한 줄 무대다',()=>{
  assert.match(mapCss,/@media \(max-width: 743px\) and \(orientation: portrait\) \{\s*\.map-surface \{ aspect-ratio: 342 \/ 250; \}/);
  assert.match(mapCss,/@media \(min-width: 360px\) \{\s*\.map-board \.map-pin \{ width: 52px; min-width: 52px; max-width: 52px; height: 52px; min-height: 52px; max-height: 52px; \}/);
  assert.match(mapCss,/@media \(min-width: 744px\) \{\s*\.map-board \.map-pin \{ width: 56px; min-width: 56px/);
  assert.doesNotMatch(mapCss,/@keyframes|animation\s*:|opacity:\s*0/);
  assert.match(css,/@media \(min-width: 744px\) and \(orientation: portrait\) \{[^@]*\.map-question \{\s*display: grid; grid-template-columns: 200px minmax\(0, 1fr\) 240px;\s*grid-template-areas: "flag label listen" "flag name listen"/);
  assert.match(css,/\.map-who \.map-question-flag \{ width: 120px; height: 80px/);
  assert.match(css,/@media \(min-width: 744px\) \{[^@]*\.map-who \.map-question-flag \{ width: 200px; height: 134px; \}/);
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'map'});f.c.FQ.app.startGame(['kr']);
  const html=f.node('main').innerHTML;
  assert.match(html,/<div class="flag-stage map-question"><div class="q-label">🗺️ 이 나라는 어디에 있을까요\?<\/div><div class="map-who"><img class="map-question-flag" src="flags\/kr\.svg" alt="대한민국 국기"><div class="big-name">대한민국<\/div><\/div><button class="btn btn-listen" data-speak="대한민국" type="button">🔊 들어보기<\/button><\/div>/);
  assert.match(html,/<div class="quiz-body map-quiz"><div class="quiz-stage-col">/);
});

test('결과 화면은 큰 제목·큰 숫자 두 칸·여행 카드·레벨 링·상자·새 스티커·한 번 더 64px·홈으로 56px 이다',()=>{
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
  assert.match(css,/\.btn-yellow \{ background: var\(--accent\)/);assert.match(css,/\.btn-mid \{ min-height: 56px/);
  assert.match(css,/\.big-stats \{ display: grid; grid-template-columns: 1fr 1fr/);
  assert.match(css,/\.big-stat \.v \{ font-size: 2\.75rem; font-weight: 900/);
  assert.match(css,/\.tc-grid \{ display: grid; grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css,/\.result-replay \{[^}]*min-height: 44px/);
  // 상자가 안 열린 판은 다음 상자까지 남은 칸을 보여 주고, 새 스티커·한 번 더 만나기가 없으면 그 카드도 없다.
  const g=fixture();g.c.FQ.storage.recordAnswer('kr',true);g.c.FQ.storage.updateSettings({mode:'choice4',speak:false});g.c.FQ.app.startGame(['kr']);
  g.c.FQ.test.submit({code:'kr'});g.c.FQ.test.goNext();
  const html2=g.node('main').innerHTML;
  assert.match(html2,/<div class="chest-note soft" role="group" aria-label="여행 카드 2 \/ 5장 · 깜짝 상자를 기다려요">/);
  assert.doesNotMatch(html2,/new-sticker-card|retry-wrong|level-gain">경험치 \+0/);
  assert.match(html2,/aria-label="오늘 만난 나라 1개"/);
});

test('깜짝 상자는 대륙 모양 셋 중 하나를 골라 열고, 흔들기가 걸리면 한 번 더 두드리며, 닫기 전에는 다음 단추가 잠긴다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'choice4',speak:false});f.c.FQ.storage.recordChest(null);
  f.c.FQ.app.startGame(['kr']);const a=f.c.FQ.test;
  a.state.rng=()=>0;a.state.rngKind=()=>0.2;   // 열림 · 반짝 상자(0.05~0.25) · 흔들기(0.2<0.3)
  a.submit({code:'kr'});f.releases.at(-1)();
  const back=f.node('created'),html=back.innerHTML;
  assert.match(html,/<div class="chest-card shiny" role="dialog" aria-modal="true" aria-label="깜짝 상자를 찾았어요">/);
  assert.equal((html.match(/class="chest-pick"/g)||[]).length,3);
  assert.match(html,/id="chest-sub">연등 셋 중 하나를 골라 봐요</,'대한민국은 아시아라 연등');
  assert.match(html,/🏮/);assert.match(html,/반짝 상자 ✨/);assert.match(html,/\+5점[\s\S]*\+40/);
  assert.match(html,/<div class="chest-friend" role="group" aria-label="대한민국 친구 카드"><img src="flags\/kr\.svg"/);
  assert.equal(f.music.at(-1).event,'chest');assert.equal(f.music.at(-1).opts.prefer,'chest-01-musicbox');
  assert.equal(f.node('#next').disabled,true);
  assert.equal(a.state.xpGained,50);assert.equal(a.state.game.bonusScore,5);
  assert.deepEqual(JSON.parse(JSON.stringify(f.c.FQ.storage.chestState())),{since:0,opened:1,kinds:{shiny:1}});
  const pick=f.node('pick');const tap=()=>back.handlers.click({target:{closest:(sel)=>sel==='.chest-pick'?pick:null}});
  tap();  // 첫 두드림: 흔들리기만 한다
  assert.ok(pick.classList.contains('wobble'));assert.equal(f.node('#chest-sub').textContent,'한 번 더 두드려요!');
  assert.notEqual(f.node('#chest-open').hidden,false);
  tap();  // 두 번째: 열린다
  assert.equal(f.node('#chest-picks').hidden,true);assert.equal(f.node('#chest-open').hidden,false);
  assert.equal(f.node('#chest-sub').textContent,'반짝반짝 상자예요!');
  assert.equal(f.node('#next').disabled,true,'닫기 전에는 다음 단추가 잠겨 있다');
  back.handlers.click({target:{closest:(sel)=>sel==='#chest-close'?true:null}});
  assert.equal(f.node('#next').disabled,false);
  // 흔들기가 없으면 한 번에 열리고, 황금 상자는 보너스 10점·경험치 60.
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'choice4',speak:false});g.c.FQ.storage.recordChest(null);
  g.c.FQ.app.startGame(['kr']);const b=g.c.FQ.test;b.state.rng=()=>0;b.state.rngKind=()=>0.4;
  const seq=[0.01,0.9];b.state.rngKind=()=>seq.shift();   // 종류 황금 · 흔들기 없음
  b.submit({code:'kr'});g.releases.at(-1)();
  const back2=g.node('created');assert.match(back2.innerHTML,/class="chest-card gold"[\s\S]*황금 상자 👑[\s\S]*\+10점[\s\S]*\+60/);
  back2.handlers.click({target:{closest:(sel)=>sel==='.chest-pick'?g.node('pick2'):null}});
  assert.equal(g.node('#chest-open').hidden,false);assert.equal(b.state.game.bonusScore,10);assert.equal(b.state.xpGained,70);
});

test('아빠 설정의 제한 시간 줄은 국기 놀이에서만 보이고 다른 놀이에서는 감춘다(알약과 저장값은 남는다)',()=>{
  for(const [mode,shown] of [['choice4',true],['voice',true],['capital',false],['map',false],['symbol',false]]){
    const f=fixture();f.c.FQ.storage.updateSettings({mode,timer:10,dev:{art:true}});f.c.FQ.app.home();
    const html=f.node('main').innerHTML;
    const hidden=/<div class="field" style="margin-top:12px;display:none">\s*<label for="opt-timer">/.test(html);
    assert.equal(!hidden,shown,mode);assert.match(html,/data-timer="10" aria-pressed="true"/,mode+' 알약과 저장값은 남는다');
  }
});

test('명소 정답 카드에는 수도 한 줄과 듣기 단추가 있고 누르면 수도 이름과 설명 두 문구를 읽는다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'place',speak:false,dev:{art:true}});f.c.FQ.app.startGame(['kr']);meetNext(f);
  const a=f.c.FQ.test;f.node('#question-art').handlers.load();a.submit({code:'kr'});
  const html=f.node('#feedback-area').innerHTML;
  assert.match(html,/<span class="remember-capital">🏙️ 서울 · 대한민국의 수도예요 <button class="btn btn-sm btn-ghost cap-listen" type="button" data-speak="서울" data-speak-extra="대한민국의 수도예요" data-label="🔊" aria-label="수도 들어보기">🔊<\/button><\/span>/);
  const t=f.node('cap');t.setAttribute('data-speak','서울');t.setAttribute('data-speak-extra','대한민국의 수도예요');t.setAttribute('data-label','🔊');
  f.clickDelegated('[data-speak]',t);f.releases.at(-1)();
  assert.deepEqual(f.spoken.at(-1),['서울','대한민국의 수도예요']);
  // 상징물 카드에는 수도 줄이 없다.
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'symbol',speak:false,dev:{art:true}});g.c.FQ.app.startGame(['kr']);meetNext(g);
  g.node('#question-art').handlers.load();g.c.FQ.test.submit({code:'kr'});
  assert.doesNotMatch(g.node('#feedback-area').innerHTML,/remember-capital/);
});
console.log('앱 흐름 회귀 검사 '+passed+'건 통과');

/* ---- 2026-09-17 수도 놀이 뒤집기 (시안 PhoneCapital · D17 채택 B: capital 축 분리 + 🏙️ 도장) ---- */

test('수도 놀이는 처음 만나는 나라에 만나기 카드(국기·나라·수도, 기록 없음)를 먼저 내고 카드가 떠 있는 동안은 채점하지 않는다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital',timer:10});f.c.FQ.app.startGame(['mx']);
  const a=f.c.FQ.test,html=f.node('main').innerHTML;
  assert.match(html,/<div class="flag-stage meet-card capital-meet"><div class="q-label">처음 만나는 나라예요 · 먼저 들어 볼까요\?<\/div>/);
  assert.match(html,/<div class="meet-art"><img class="flag-img" src="flags\/mx\.svg" alt="멕시코 국기"><\/div>/);
  assert.match(html,/<div class="big-name">멕시코<\/div><div class="meet-caption">🏙️ 멕시코시티<\/div>/);
  assert.match(html,/<button class="btn btn-listen btn-listen-soft" id="meet-speak" data-speak="멕시코시티" data-speak-extra="멕시코의 수도예요" data-label="🔊 다시 듣기" type="button">🔊 다시 듣기<\/button>/);
  assert.match(html,/<button class="btn btn-big btn-go btn-yellow" id="meet-next" type="button">문제 풀어 볼게요 →<\/button>/);
  assert.match(html,/<div id="answer-area" hidden>/);assert.doesNotMatch(html,/question-art|meet-quiz"[^>]*capital-question/);
  // 카드는 [수도, 나라의 수도예요] 두 문구(둘 다 기존 음원)를 읽고, 제한 시간은 돌지 않으며, 기록도 남지 않는다.
  f.releases.at(-1)();assert.deepEqual(f.spoken,[['멕시코시티','멕시코의 수도예요']]);
  assert.equal(a.state.timerId,null);assert.equal(a.state.meeting,true);
  a.submit({code:'mx'});assert.equal(a.state.answered,false);
  assert.equal(f.c.FQ.storage.allAxisStats('capital').mx,undefined);assert.equal(f.c.FQ.storage.allCountryStats().mx,undefined);
  // 다시 듣기는 같은 두 문구, 실패하면 단추가 눌러 달라고 바뀐다.
  f.node('#meet-speak').setAttribute('data-speak','멕시코시티');f.node('#meet-speak').setAttribute('data-speak-extra','멕시코의 수도예요');f.node('#meet-speak').setAttribute('data-label','🔊 다시 듣기');
  f.clickDelegated('[data-speak]',f.node('#meet-speak'));f.releases.at(-1)();assert.deepEqual(f.spoken.at(-1),['멕시코시티','멕시코의 수도예요']);
  f.playbackFailures.at(-1)();assert.match(f.node('#meet-speak').textContent,/다시 눌러서/);
  // 카드를 넘기면 같은 나라가 문제로 나온다. 수도 놀이에는 제한 시간이 없다(D23). 두 번째로 만나면 카드 없이 바로 문제다.
  meetNext(f);assert.equal(a.state.meeting,false);assert.equal(a.state.game.current().country.code,'mx');assert.equal(a.state.timerId,null);
  assert.match(f.node('main').innerHTML,/capital-question/);
  a.submit({code:'mx'});a.goNext();
  const g=fixture();g.c.FQ.storage.recordAnswer('mx',true,'capital');g.c.FQ.storage.updateSettings({mode:'capital'});g.c.FQ.app.startGame(['mx']);
  assert.doesNotMatch(g.node('main').innerHTML,/meet-next/);assert.match(g.node('main').innerHTML,/capital-question/);
});

test('수도 문제는 큰 🔊 가 수도 이름을 자동으로 한 번 읽고, 보기는 국기 4장(나라 이름 작게)이며 답은 나라 code 로 채점한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital'});f.c.FQ.app.startGame(['mx']);meetNext(f);
  const a=f.c.FQ.test,q=a.state.game.current(),html=f.node('main').innerHTML,mx=f.c.FQ.quiz.byCode('mx');
  // 무대(시안 PhoneCapital): 작은 지시문 → 88px 노란 🔊 '눌러서 들어보기'(CSS 규칙) → 보조 글자 수도 이름. 국기·나라 이름은 무대에 없다(답이 된다).
  assert.match(css,/\.capital-question \.btn-listen \{ min-height: 88px; font-size: 1\.5rem; \}/);
  assert.match(html,/<div class="flag-stage capital-question"><div class="q-label">🏙️ 어느 나라의 수도일까요\?<\/div><button class="btn btn-listen capital-listen" id="capital-listen" data-speak="멕시코시티" data-label="🔊 눌러서 들어보기" type="button">🔊 눌러서 들어보기<\/button><div class="big-name capital-name muted">멕시코시티<\/div><\/div>/);
  const stage=html.match(/<div class="flag-stage capital-question">[\s\S]*?<div id="feedback-area">/)[0];
  assert.doesNotMatch(stage,/flags\/mx|>멕시코</);
  // 보기: 그림 놀이와 같은 국기 격자 부품, 4장, 나라 중복 없음, 정답 포함, 수도 이름은 보기에 없다.
  assert.match(html,/<div class="answer-grid art-grid">/);
  const choices=html.match(/<button class="answer-btn art-choice" type="button" data-code="[a-z]+"><img src="flags\/[a-z]+\.svg" alt="" width="160" height="120"><span class="art-choice-name">[^<]+<\/span><\/button>/g)||[];
  assert.equal(choices.length,4);
  const codes=choices.map(c=>c.match(/data-code="([a-z]+)"/)[1]);
  assert.equal(new Set(codes).size,4);assert.ok(codes.includes('mx'));
  for(const c of q.options)assert.doesNotMatch(html.slice(html.indexOf('answer-grid')),new RegExp(rx(c.capital)));
  assert.match(html,/id="hint"/);assert.match(html,/id="skip"/);assert.match(html,/id="combo-title">여행 카드 0 \/ 5장</);
  // 자동 낭독: 만나기 카드처럼 마이크 해제 뒤에 수도 이름 한 문구만 읽는다. 실패하면 단추가 '다시 눌러서 듣기'로 바뀐다.
  assert.equal(f.spoken.length,0);f.releases.at(-1)();assert.deepEqual(f.spoken,[['멕시코시티']]);
  f.playbackFailures.at(-1)();assert.equal(f.node('#capital-listen').textContent,'🔊 다시 눌러서 듣기');assert.ok(f.node('#capital-listen').classList.contains('needs-tap'));
  // 단추를 누르면 다시 읽고 라벨이 돌아온다.
  const btn=f.node('#capital-listen');btn.setAttribute('data-speak','멕시코시티');btn.setAttribute('data-label','🔊 눌러서 들어보기');
  f.clickDelegated('[data-speak]',btn);assert.equal(btn.textContent,'🔊 눌러서 들어보기');f.releases.at(-1)();assert.deepEqual(f.spoken.at(-1),['멕시코시티']);
  // 채점은 나라 code. 정답 카드는 국기 + 나라 이름 + '🏙️ 수도 · 나라의 수도예요', 읽는 문구는 기존 [수도, 나라의 수도예요].
  const dailyBefore=JSON.stringify(f.c.FQ.storage.daily());
  const clicked=f.node('choice');clicked.setAttribute('data-code','mx');f.clickDelegated('.answer-btn',clicked);
  assert.equal(a.state.answered,true);assert.equal(a.state.game.correct,1);
  const fb=f.node('#feedback-area').innerHTML;
  assert.match(fb,/<div class="name-row"><img class="fb-flag" src="flags\/mx\.svg" alt="멕시코 국기"><div class="kname">멕시코<\/div><\/div>/);
  assert.match(fb,/<div class="remember-box"><div class="remember-hint"><span class="remember-body">🏙️ 멕시코시티 · 멕시코의 수도예요<\/span><\/div><\/div>/);
  assert.doesNotMatch(fb,/remember-title|remember-art/);
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
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'capital'});g.c.FQ.app.startGame(['mx']);meetNext(g);
  const wrong=g.c.FQ.test.state.game.current().options.find(c=>c.code!=='mx').code;
  g.c.FQ.test.submit({code:wrong});
  assert.equal(g.c.FQ.storage.allAxisStats('capital').mx.wrong,1);assert.deepEqual([...g.c.FQ.storage.wrongList()],[]);
  assert.match(g.node('#feedback-area').innerHTML,/<div class="kname">멕시코<\/div>/);
});

test('수도 놀이는 새 축 규칙을 받는다 — 시간 초과는 지나감, 한 판 안 다시 만나기, 대결 숨김, 홈 안내, 결과의 수도 줄',()=>{
  // 시간 초과: 오답으로 적지 않고 다음 문제로 간다.
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'capital',timer:10});f.c.FQ.app.startGame(['mx','kr']);meetNext(f);
  const a=f.c.FQ.test,first=a.state.game.current().country.code;
  for(let i=0;i<10;i++)f.runDelay(1000);
  // 수도 놀이에는 제한 시간이 없어 10초가 지나도 그대로다(D23).
  assert.equal(f.c.FQ.storage.allAxisStats('capital')[first],undefined);
  assert.equal(a.state.game.index,0);assert.equal(a.state.answered,false);assert.equal(a.state.unscored,0);assert.equal(a.state.timerId,null);
  // 한 판 안 다시 만나기: 처음 만난 나라는 3문제 뒤에 한 번 더 나온다(국기 축 함수는 쓰지 않는다).
  const g=fixture();g.c.FQ.storage.updateSettings({mode:'capital',count:6,level:'all',speak:false});g.c.FQ.app.startGame(null);
  const b=g.c.FQ.test;let seen=[];
  for(let n=0;n<40&&b.state.game&&!b.state.game.isOver();n++){
    meetNext(g);const cur=b.state.game.current();if(!cur)break;seen.push(cur.country.code);b.submit({code:cur.country.code});b.goNext();
  }
  assert.equal(seen.length,6);assert.ok(b.state.game.againCount>=1,'수도에서도 처음 만난 쌍을 다시 만난다');
  assert.ok(new Set(seen).size<6,'같은 나라를 한 판에 두 번 만난다');
  assert.deepEqual(Object.keys(g.c.FQ.storage.allCountryStats()),[]);
  // 결과: 국기 스티커 없음, 만난 나라는 나라 수, 한 번 더 만날 나라 줄에는 수도 이름.
  const h=fixture();h.c.FQ.storage.updateSettings({mode:'capital',speak:false});h.c.FQ.app.startGame(['mx']);meetNext(h);
  h.c.FQ.test.submit({text:''},true);h.c.FQ.test.goNext();
  const res=h.node('main').innerHTML;
  assert.match(res,/aria-label="오늘 만난 나라 1개"/);assert.doesNotMatch(res,/new-sticker-card/);
  assert.match(res,/<div class="wh">🏙️ 멕시코시티<\/div>/);
  assert.equal(h.c.FQ.storage.history()[0].mode,'capital');
  // 홈: 수도 놀이 단추는 그대로, 라벨은 '수도 듣고 국기 찾기', 오늘의 도전 안내가 뜨고 대결 스위치는 숨는다.
  const i=fixture();i.c.FQ.storage.updateSettings({mode:'capital',players:['민규','아빠']});i.c.FQ.app.home();
  const home=i.node('main').innerHTML;
  assert.match(home,/id="play-capital"[^>]*aria-pressed="true"/);assert.match(home,/수도를 듣고 국기를 찾아요/);
  assert.match(home,/지금 놀이로는 칸이 안 올라가요 · 눌러서 국기 놀이로 바꾸기/);
  assert.match(home,/class="switch hidden" id="duel-switch"/);
  assert.equal(i.c.FQ.quiz.MODES.capital.label,'수도 듣고 국기 찾기');assert.equal(i.spoken.length,0);
  // 읽어 주는 문구는 전부 수아 음원에 있다: 수도 이름·'나라의 수도예요'. 새 화면 글자는 읽지 않는다.
  const manifest=fs.readFileSync(path.join(root,'js/voice-manifest.js'),'utf8');
  for(const c of f.c.FQ.countries){assert.ok(manifest.includes('"'+c.capital+'"'),c.capital);assert.ok(manifest.includes('"'+c.ko+'의 수도예요"'),c.ko);}
  for(const line of ['눌러서 들어보기','어느 나라의 수도일까요','수도 듣고 국기 찾기','에 있어요'])assert.ok(!manifest.includes('"'+line+'"'),line+' 는 화면 글자일 뿐이다');
});
