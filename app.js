const $=id=>document.getElementById(id);
const DEF={mode:'mqtt',ip:'',broker:'wss://broker.hivemq.com:8884/mqtt',topic:'ptik/kel4/smartlighting',base:8,watt:10,luxD:30,luxT:350};
let cfg={...DEF,...JSON.parse(localStorage.getItem('sl_cfg3')||'{}')};
const hhmm=()=>new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour12:false});
let log=JSON.parse(localStorage.getItem('sl_log')||'[]'),cur=null,pts=[],onSec=0,brokerOk=false,devOnline=false,timer=null,mq=null;
const lx=c=>c.dark?cfg.luxD:cfg.luxT, can=()=>cfg.mode==='mqtt';
const send=c=>{if(mq&&brokerOk)mq.publish(cfg.topic+'/cmd',c)};

function ingest(d){
  const p=cur;
  cur={dark:!!d.dark,motion:!!d.motion,lamp:!!d.lamp,warm:!!d.warmup,mode:d.mode||'auto',pwm:d.pwm??100,tg:!!d.tg};
  if(typeof d.on_s==='number')onSec=d.on_s;
  if((!p&&cur.lamp)||(p&&p.lamp!==cur.lamp)){
    log.unshift({t:hhmm(),on:cur.lamp,m:cur.mode});log=log.slice(0,50);
    localStorage.setItem('sl_log',JSON.stringify(log));
  }
  pts.push(cur);if(pts.length>120)pts.shift();
  render();
}
function render(){
  if(!cur)return;
  $('hero').classList.toggle('on',cur.lamp);
  $('lamp').textContent=cur.lamp?'ON':'OFF';
  $('pwmShow').textContent=cur.lamp?`Kecerahan ${cur.pwm}%`:'';
  $('why').textContent=cur.mode==='manual'?'Mode manual: lampu diatur dari dashboard.':
    cur.lamp?'Gelap dan ada orang, lampu menyala.':!cur.dark?'Ruangan sudah terang, lampu mati.':'Tidak ada orang, lampu mati.';
  $('motion').textContent=cur.warm?'PEMANASAN':cur.motion?'TERDETEKSI':'TIDAK ADA';
  $('motionT').textContent=cur.warm?'PIR sedang pemanasan':cur.motion?'Ada orang di ruangan':'Ruangan kosong';
  const b=$('bars');b.innerHTML='';pts.slice(-24).forEach(p=>{const s=document.createElement('span');if(p.motion)s.className='on';b.append(s)});
  const L=lx(cur);$('lux').textContent=L;$('dark').textContent=(cur.dark?'Gelap':'Terang')+' · estimasi dari sensor DO';
  $('gfg').style.strokeDasharray=`${Math.min(L/Math.max(600,cfg.luxT*1.2),1)*251.3} 251.3`;
  $('bAuto').classList.toggle('act',cur.mode==='auto');$('bMan').classList.toggle('act',cur.mode==='manual');
  $('swLamp').checked=cur.lamp;$('swLamp').disabled=cur.mode==='auto'||!can();
  if(document.activeElement!==$('pwm'))$('pwm').value=cur.pwm;$('pwmV').textContent=cur.pwm+'%';
  $('swTg').checked=cur.tg;
  $('ctlNote').textContent=can()?(cur.mode==='auto'?'Pindah ke mode Manual untuk menyalakan lampu dari sini.':''):'Kontrol hanya tersedia di mode MQTT.';
  renderLog();draw();dur();
}
function renderLog(){
  const u=$('log');u.innerHTML='';
  log.forEach(e=>{const li=document.createElement('li');
    li.innerHTML=`<span>${e.t} WIB · ${e.m==='manual'?'Manual':'Otomatis'}</span><span class="tag ${e.on?'on':'off'}">Lampu ${e.on?'ON':'OFF'}</span>`;u.append(li)});
  $('empty').classList.toggle('hide',log.length>0);
}
function dur(){
  const m=Math.floor(onSec/60),h=onSec/3600,kB=cfg.base*cfg.watt/1000,kA=h*cfg.watt/1000;
  $('dur').textContent=`${Math.floor(m/60)} Jam ${m%60} Menit`;$('baseT').textContent=cfg.base;
  const pc=Math.min(h/cfg.base,1);$('durp').textContent=Math.round(pc*100)+'%';$('rdur').style.strokeDashoffset=326.7*(1-pc);
  const sv=Math.max(0,(kB-kA)/kB*100);$('savP').textContent=sv.toFixed(1).replace('.',',')+'%';
  $('eA').style.width=Math.min(kA/kB*100,100)+'%';
  $('eBv').textContent=kB.toFixed(3).replace('.',',')+' kWh';$('eAv').textContent=kA.toFixed(3).replace('.',',')+' kWh';
}
function draw(){
  const cv=$('cv'),g=cv.getContext('2d'),W=cv.width,H=cv.height;g.clearRect(0,0,W,H);if(pts.length<2)return;
  const max=Math.max(cfg.luxT,cfg.luxD)*1.25,st=(W-20)/119,o=120-pts.length,X=i=>10+(o+i)*st,Y=v=>H-24-v/max*(H-54);
  g.beginPath();g.moveTo(X(0),H-24);pts.forEach((p,i)=>g.lineTo(X(i),Y(lx(p))));g.lineTo(X(pts.length-1),H-24);g.fillStyle='rgba(239,71,111,.12)';g.fill();
  g.beginPath();pts.forEach((p,i)=>i?g.lineTo(X(i),Y(lx(p))):g.moveTo(X(i),Y(lx(p))));
  g.strokeStyle='#ef476f';g.lineWidth=4;g.lineJoin='round';g.stroke();
  g.fillStyle='#6c4df0';pts.forEach((p,i)=>{if(p.lamp)g.fillRect(X(i),H-14,st+.5,10)});
}
function tick(){
  $('clock').textContent=hhmm();
  const p=$('conn');p.textContent=!brokerOk?'Broker terputus':!devOnline?'ESP32 offline':'Terhubung';
  p.className='pill '+(brokerOk&&devOnline?'on':'off');
}
function start(){
  clearInterval(timer);if(mq){mq.end(true);mq=null}
  cur=null;pts=[];brokerOk=false;devOnline=false;
  if(cfg.mode==='http'){
    brokerOk=true;
    timer=setInterval(async()=>{try{const r=await fetch(`http://${cfg.ip}/data`,{cache:'no-store'});ingest(await r.json());devOnline=true}catch(e){devOnline=false}},2000);
  }else{
    mq=mqtt.connect(cfg.broker,{reconnectPeriod:3000});
    mq.on('connect',()=>{brokerOk=true;mq.subscribe([cfg.topic,cfg.topic+'/status'])});
    mq.on('close',()=>{brokerOk=false});
    mq.on('message',(t,m)=>{const s=m.toString();
      if(t.endsWith('/status')){devOnline=s==='online';return}
      try{ingest(JSON.parse(s))}catch(e){}});
  }
}
$('bAuto').onclick=()=>send('auto');$('bMan').onclick=()=>send('manual');
$('swLamp').onchange=e=>send(e.target.checked?'on':'off');
$('swTg').onchange=e=>send('tg:'+(e.target.checked?1:0));
$('pwm').oninput=e=>$('pwmV').textContent=e.target.value+'%';
$('pwm').onchange=e=>send('pwm:'+e.target.value);
$('btnSet').onclick=()=>{$('fMode').value=cfg.mode;$('fIp').value=cfg.ip;$('fBroker').value=cfg.broker;$('fTopic').value=cfg.topic;
  $('fBase').value=cfg.base;$('fWatt').value=cfg.watt;$('fLd').value=cfg.luxD;$('fLt').value=cfg.luxT;$('dlg').showModal();};
$('frm').onsubmit=e=>{if(e.submitter&&e.submitter.value==='save'){
  cfg={mode:$('fMode').value,ip:$('fIp').value.trim(),broker:$('fBroker').value.trim(),topic:$('fTopic').value.trim(),
    base:+$('fBase').value||8,watt:+$('fWatt').value||10,luxD:+$('fLd').value||0,luxT:+$('fLt').value||350};
  localStorage.setItem('sl_cfg3',JSON.stringify(cfg));start();}};
$('btnReset').onclick=()=>{log=[];localStorage.setItem('sl_log','[]');renderLog();$('dlg').close()};
setInterval(tick,1000);tick();renderLog();dur();start();
