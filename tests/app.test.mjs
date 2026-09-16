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

test('오답·건너뛰기·시간 초과도 한 장씩 쌓여 다섯 장마다 상자가 열린다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'choice4',count:5,speak:false,timer:10});
  f.c.FQ.app.startGame(null);const a=f.c.FQ.test;
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
  assert.match(f.node('created').innerHTML,/여행책에 다섯 장이 모였어요/);
  assert.equal(f.c.FQ.progress.chestProgress(f.c.FQ.storage.stats().asked).into,0);
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
  const f=fixture();for(let i=0;i<4;i++)f.c.FQ.storage.recordAnswer('jp',false);
  const a=f.startVoice(['kr']);a.submit({text:''},true);f.releases.at(-1)();
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
  const f=fixture();f.c.FQ.app.boot();for(let i=0;i<4;i++)f.c.FQ.storage.recordAnswer('jp',false);
  const a=f.startVoice(['kr']);a.submit({text:''},true);f.releases.at(-1)();f.playbackFailures.at(-1)();
  assert.equal(f.music.at(-1).event,'chest');
  f.c.document.hidden=true;f.events.visibilitychange[0]();
  assert.equal(f.music.at(-1).cancelled,true);assert.equal(f.node('#next').disabled,false);
});

test('겹친 보상은 상자, 단계, 스티커 순으로 한 음악만 고른다',()=>{
  const f=fixture();f.c.FQ.storage.addXp(295);const a=f.startVoice(['kr']);
  a.submit({code:'kr'});f.releases.at(-1)();assert.equal(f.music.at(-1).event,'level');
  const g=fixture(),b=g.startVoice(['kr']);b.submit({code:'kr'});g.releases.at(-1)();
  assert.equal(g.music.at(-1).event,'sticker');
  const h=fixture();for(let i=0;i<4;i++)h.c.FQ.storage.recordAnswer('jp',false);
  h.c.FQ.storage.addXp(295);const c=h.startVoice(['kr']);c.submit({code:'kr'});h.releases.at(-1)();
  assert.equal(h.music.length,0);h.finishVoice();assert.equal(h.music.at(-1).event,'chest');
});

test('정답 전용 음악과 홈 배경음은 기본 꺼짐이며 선택하면 사용할 수 있다',()=>{
  const f=fixture();assert.equal(f.c.FQ.storage.settings().correctMusic,false);assert.equal(f.c.FQ.storage.settings().homeMusic,false);
  f.c.FQ.storage.recordAnswer('kr',true);const a=f.startVoice(['kr']);a.submit({code:'kr'});f.releases.at(-1)();
  assert.equal(f.music.at(-1).event,'discovery');
  f.c.FQ.storage.updateSettings({correctMusic:true});f.c.FQ.app.startGame(['kr']);a.submit({code:'kr'});f.releases.at(-1)();
  assert.equal(f.music.at(-1).event,'correct');
  f.c.FQ.storage.updateSettings({homeMusic:true});f.c.FQ.app.home();f.releases.at(-1)();assert.equal(f.music.at(-1).event,'homeBgm');
  f.c.FQ.app.startGame(['kr']);assert.equal(f.music.at(-1).cancelled,true);
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
    assert.match(f.node('main').innerHTML,new RegExp('data-mode="'+mode+'"'));
    f.c.FQ.app.startGame(['kr']);const a=f.c.FQ.test,q=a.state.game.current();
    assert.match(f.node('main').innerHTML,new RegExp('images/'+(mode==='place'?'places':'symbols')+'/kr.webp'));
    assert.equal((f.node('main').innerHTML.match(/class="answer-btn art-choice"/g)||[]).length,4);
    f.node('#question-art').handlers.load();
    const before=JSON.stringify(f.c.FQ.storage.daily());
    a.submit({code:'kr'});f.releases.at(-1)();f.finishMusic();
    assert.equal(f.c.FQ.storage.axisStat(mode,'kr').correct,1);
    assert.equal(f.c.FQ.storage.countryStat('kr').correct,0);
    assert.equal(JSON.stringify(f.c.FQ.storage.daily()),before);
    assert.equal(a.state.newStickers.length,0);
    assert.deepEqual(f.spoken.at(-1),[q.country.ko,q.country.fact]);
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

test('느린 그림 다운로드 중에는 제한 시간·제출이 시작되지 않고 load 뒤에 시작한다',()=>{
  const f=fixture();f.c.FQ.storage.updateSettings({mode:'symbol',timer:10,dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  const a=f.c.FQ.test;
  assert.equal(a.state.artUnavailable,true);assert.equal(f.node('#skip').disabled,true);
  for(let i=0;i<15;i++)f.runDelay(1000);
  a.submit({code:'kr'});a.submit({text:''},true);
  assert.equal(f.c.FQ.storage.stats().asked,0);assert.equal(a.state.answered,false);
  f.node('#question-art').handlers.load();
  assert.equal(a.state.artUnavailable,false);assert.equal(f.node('#skip').disabled,false);
  for(let i=0;i<10;i++)f.runDelay(1000);
  assert.equal(a.state.timedOut,true);assert.equal(f.c.FQ.storage.axisStat('symbol','kr').seen,1);
});

test('숨긴 화면에서 그림이 도착하면 복귀 전까지 기다리고 전체 제한 시간을 준다',()=>{
  const f=fixture();f.c.FQ.app.boot();
  f.c.FQ.storage.updateSettings({mode:'symbol',timer:10,dev:{art:true}});f.c.FQ.app.startGame(['kr']);
  const a=f.c.FQ.test;
  f.c.document.hidden=true;f.events.visibilitychange[0]();
  f.node('#question-art').handlers.load();
  for(let i=0;i<12;i++)f.runDelay(1000);
  assert.equal(a.state.timerId,null);assert.equal(a.state.answered,false);assert.equal(a.state.timedOut,false);
  assert.equal(f.c.FQ.storage.axisStat('symbol','kr').seen,0);
  f.c.document.hidden=false;f.events.visibilitychange[0]();
  assert.equal(a.state.timeLeft,10);
  for(let i=0;i<9;i++)f.runDelay(1000);
  assert.equal(a.state.answered,false);assert.equal(a.state.timeLeft,1);
  f.runDelay(1000);
  assert.equal(a.state.timedOut,true);assert.equal(f.c.FQ.storage.axisStat('symbol','kr').seen,1);
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
  assert.equal(a.state.timeLeft,10);assert.notEqual(a.state.timerId,null);
});

test('지도·그림·명소 놀이에서는 오늘의 도전이 왜 안 오르는지 화면으로 알려 준다',()=>{
  for(const mode of ['map','symbol','place']){
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
  for(const mode of ['voice','typing','capital','reverse']){
    const f=fixture();f.c.FQ.storage.updateSettings({mode,continent:'아프리카'});f.c.FQ.app.home();
    f.node('#daily-go').click();
    assert.equal(f.c.FQ.storage.settings().mode,mode,mode);
    assert.equal(f.c.FQ.storage.settings().continent,f.c.FQ.progress.daily().continent,mode);
  }
  for(const mode of ['map','symbol','place']){
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

console.log('앱 흐름 회귀 검사 '+passed+'건 통과');
