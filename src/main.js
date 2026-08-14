import './style.css';
import './save.css';
import { registerSW } from 'virtual:pwa-register';
import {
  ALL_FORMATS, AudioSample, AudioSampleSink, BlobSource, BufferTarget,
  Conversion, Input, Mp4OutputFormat, Output, Quality,
  getFirstEncodableAudioCodec, getFirstEncodableVideoCodec
} from 'mediabunny';

registerSW({ immediate: true });

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['toast','fileInput','video','stage','cropBox','emptyHint','fileInfo','playButton','seekBar','playbackTime','rotateLeft','rotateRight','rotationReset','rotationLabel','cropToggle','cropReset','cropPanel','cropLeft','cropRight','cropTop','cropBottom','cropLeftLabel','cropRightLabel','cropTopLabel','cropBottomLabel','cropInfo','cropApply','trimStart','trimEnd','startLabel','endLabel','startHere','endHere','trimReset','analyzeAudio','audioResult','audioMode','exportButton','cancelButton','saveButton','progress','progressLabel','status'].map(id => [id,$(id)]));
const state = { file:null, input:null, url:null, duration:0, width:0, height:0, rotation:0, cropEnabled:false, audioStats:null, conversion:null, busy:false, outputFile:null, outputUrl:null };
let toastTimer=null;

function showToast(text){
  clearTimeout(toastTimer); ui.toast.textContent=text; ui.toast.classList.add('show');
  toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),2600);
}

function clearOutput(){
  if(state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.outputFile=null; state.outputUrl=null; ui.saveButton.hidden=true;
}

function time(value){
  value=Math.max(0,Number(value)||0); const minutes=Math.floor(value/60); const seconds=value-minutes*60;
  return `${String(minutes).padStart(2,'0')}:${seconds.toFixed(1).padStart(4,'0')}`;
}
function setStatus(text){ ui.status.textContent=text; }
function updatePlayback(){ui.seekBar.value=ui.video.currentTime||0;ui.playbackTime.textContent=`${time(ui.video.currentTime)} / ${time(state.duration)}`;ui.playButton.textContent=ui.video.paused?'再生':'一時停止';}
function updateTrim(){
  let start=Number(ui.trimStart.value), end=Number(ui.trimEnd.value);
  if(start>end-.05){ if(document.activeElement===ui.trimStart) start=Math.max(0,end-.05); else end=Math.min(state.duration,start+.05); }
  ui.trimStart.value=start; ui.trimEnd.value=end; ui.startLabel.value=time(start); ui.endLabel.value=time(end);
}
function updateRotation(){
  ui.rotationLabel.textContent=`${state.rotation}°`;
  ui.video.style.transform=`rotate(${state.rotation}deg)`;
  ui.stage.style.padding=state.rotation%180 ? '15% 0' : '0';
  requestAnimationFrame(updateCrop);
}
function cropValues(){return {left:Number(ui.cropLeft.value)/100,right:Number(ui.cropRight.value)/100,top:Number(ui.cropTop.value)/100,bottom:Number(ui.cropBottom.value)/100};}
function resetCrop(){
  for(const item of [ui.cropLeft,ui.cropRight,ui.cropTop,ui.cropBottom])item.value=0;
  state.cropEnabled=false;ui.cropPanel.hidden=true;ui.cropBox.hidden=true;ui.cropReset.hidden=true;ui.cropToggle.textContent='画面トリミングを指定';updateCrop();
}
function updateCrop(event){
  if(event?.target){const opposite=event.target===ui.cropLeft?ui.cropRight:event.target===ui.cropRight?ui.cropLeft:event.target===ui.cropTop?ui.cropBottom:ui.cropTop;event.target.value=Math.min(Number(event.target.value),90-Number(opposite.value));}
  const crop=cropValues();
  ui.cropLeftLabel.value=`${crop.left*100}%`;ui.cropRightLabel.value=`${crop.right*100}%`;ui.cropTopLabel.value=`${crop.top*100}%`;ui.cropBottomLabel.value=`${crop.bottom*100}%`;
  const rotatedWidth=state.rotation%180?state.height:state.width,rotatedHeight=state.rotation%180?state.width:state.height;
  const outWidth=Math.max(2,Math.floor(rotatedWidth*(1-crop.left-crop.right)/2)*2),outHeight=Math.max(2,Math.floor(rotatedHeight*(1-crop.top-crop.bottom)/2)*2);
  ui.cropInfo.textContent=state.cropEnabled?`出力範囲: ${outWidth}×${outHeight}`:'出力範囲: 全画面';
  if(!state.cropEnabled||!state.file)return;
  const stageRect=ui.stage.getBoundingClientRect(),videoRect=ui.video.getBoundingClientRect();
  ui.cropBox.style.left=`${videoRect.left-stageRect.left+videoRect.width*crop.left}px`;ui.cropBox.style.top=`${videoRect.top-stageRect.top+videoRect.height*crop.top}px`;
  ui.cropBox.style.width=`${videoRect.width*(1-crop.left-crop.right)}px`;ui.cropBox.style.height=`${videoRect.height*(1-crop.top-crop.bottom)}px`;
}
function outputCrop(){
  if(!state.cropEnabled)return null;const c=cropValues(),w=state.rotation%180?state.height:state.width,h=state.rotation%180?state.width:state.height;
  const left=Math.floor(w*c.left/2)*2,top=Math.floor(h*c.top/2)*2,width=Math.max(2,Math.floor((w*(1-c.left-c.right))/2)*2),height=Math.max(2,Math.floor((h*(1-c.top-c.bottom))/2)*2);
  return {left,top,width,height};
}
function setBusy(busy,label=''){
  state.busy=busy; ui.fileInput.disabled=busy; ui.exportButton.hidden=busy; ui.cancelButton.hidden=!busy;
  ui.analyzeAudio.disabled=busy||!state.file; ui.audioMode.disabled=busy; if(label) setStatus(label);
}

async function openFile(file){
  if(!file) return; clearOutput(); if(state.url) URL.revokeObjectURL(state.url);
  state.file=file; state.url=URL.createObjectURL(file); state.input=new Input({formats:ALL_FORMATS,source:new BlobSource(file)});
  ui.video.src=state.url; ui.video.style.display='block'; ui.emptyHint.hidden=true; setStatus('動画情報を読込中…');
  try{
    const videoTrack=await state.input.getPrimaryVideoTrack(); const audioTrack=await state.input.getPrimaryAudioTrack();
    if(!videoTrack) throw new Error('動画トラックが見つかりません');
    state.duration=await state.input.computeDuration(); state.rotation=0;
    const width=await videoTrack.getDisplayWidth(),height=await videoTrack.getDisplayHeight(),codec=await videoTrack.getCodec();state.width=width;state.height=height;resetCrop();
    const stats=await videoTrack.computePacketStats(100); const channels=audioTrack?await audioTrack.getNumberOfChannels():0;
    ui.trimStart.max=ui.trimEnd.max=state.duration; ui.trimStart.value=0; ui.trimEnd.value=state.duration; updateTrim(); updateRotation();
    ui.seekBar.max=state.duration;ui.seekBar.value=0;updatePlayback();
    ui.fileInfo.textContent=`${width}×${height}｜${(stats.averagePacketRate||0).toFixed(2)} fps｜${String(codec).toUpperCase()}｜${time(state.duration)}｜音声 ${channels||'なし'}ch`;
    ui.audioMode.value='none'; state.audioStats=null; ui.audioResult.className='diagnosis'; ui.audioResult.textContent=audioTrack?'未解析です。「解析する」を押してください。':'音声トラックはありません。';
    setStatus('準備完了。端末内だけで処理します。');
  }catch(error){ setStatus(`読込失敗: ${error.message}`); ui.fileInfo.textContent='この動画を解析できませんでした'; }
}

async function analyzeAudio(){
  if(!state.input||state.busy)return; const track=await state.input.getPrimaryAudioTrack();
  if(!track){ui.audioResult.textContent='音声トラックはありません。';return;}
  if(await track.getNumberOfChannels()<2){ui.audioResult.textContent='モノラル音声のため左右診断は不要です。';return;}
  setBusy(true,'左右の音声レベルを解析中…'); ui.progress.value=0; ui.progressLabel.textContent='解析中';
  try{
    const sink=new AudioSampleSink(track); let sum=[0,0],count=0,peak=[0,0],last=0;
    for await(const sample of sink.samples(0,state.duration)){
      const frames=sample.numberOfFrames;
      for(let channel=0;channel<2;channel++){
        const bytes=sample.allocationSize({planeIndex:channel,format:'f32-planar'}); const data=new Float32Array(bytes/4);
        sample.copyTo(data,{planeIndex:channel,format:'f32-planar'});
        for(const value of data){sum[channel]+=value*value;peak[channel]=Math.max(peak[channel],Math.abs(value));}
      }
      count+=frames; last=sample.timestamp+sample.duration; sample.close(); ui.progress.value=Math.min(99,last/state.duration*100);
    }
    const rms=sum.map(v=>10*Math.log10(v/Math.max(1,count))); const peakDb=peak.map(v=>20*Math.log10(Math.max(v,1e-12))); const difference=Math.abs(rms[0]-rms[1]);
    state.audioStats={rms,peak:peakDb,difference}; let recommended='none',label='補正なし';
    if(difference>=8){recommended=rms[1]>rms[0]?'right_both':'left_both';label=rms[1]>rms[0]?'右音声を左右へ':'左音声を左右へ';}
    else if(difference>=3){recommended='balance';label='左右を安全に自動均衡';}
    ui.audioResult.className=`diagnosis ${difference>=3?'warning':'good'}`;
    ui.audioResult.innerHTML=`左 ${rms[0].toFixed(1)} dB / 右 ${rms[1].toFixed(1)} dB<br>左右差 ${difference.toFixed(1)} dB<br><strong>提案: ${label}</strong>`;
    if(recommended!=='none'&&confirm(`左右差 ${difference.toFixed(1)} dBを検出しました。\n「${label}」を適用しますか？`))ui.audioMode.value=recommended;
    ui.progress.value=100;ui.progressLabel.textContent='解析完了';setStatus('音声診断が完了しました。');
  }catch(error){setStatus(`音声解析失敗: ${error.message}`);ui.progress.value=0;ui.progressLabel.textContent='失敗';}
  finally{setBusy(false);}
}

function processAudio(sample){
  const mode=ui.audioMode.value;if(mode==='none'||sample.numberOfChannels<2)return sample;
  const buffer=sample.toAudioBuffer(),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
  if(mode==='right_both')left.set(right); else if(mode==='left_both')right.set(left); else if(mode==='balance'&&state.audioStats){
    const weak=state.audioStats.rms[0]<state.audioStats.rms[1]?0:1; const room=-1-state.audioStats.peak[weak]; const gain=Math.pow(10,Math.max(0,Math.min(state.audioStats.difference,room))/20); const data=buffer.getChannelData(weak);
    for(let i=0;i<data.length;i++)data[i]*=gain;
  }
  return AudioSample.fromAudioBuffer(buffer,sample.timestamp);
}

async function exportVideo(){
  if(!state.input||state.busy)return; clearOutput(); setBusy(true,'書き出し準備中…');ui.progress.value=0;ui.progressLabel.textContent='準備中';
  try{
    const format=new Mp4OutputFormat({fastStart:'in-memory'}); const videoTrack=await state.input.getPrimaryVideoTrack(); const width=await videoTrack.getDisplayWidth(),height=await videoTrack.getDisplayHeight(),crop=outputCrop();
    const videoCodec=await getFirstEncodableVideoCodec(['avc'],{width:crop?.width??(state.rotation%180?height:width),height:crop?.height??(state.rotation%180?width:height)}); const audioCodec=await getFirstEncodableAudioCodec(['aac']);
    if(!videoCodec)throw new Error('この端末ではH.264エンコードを開始できません');
    const target=new BufferTarget(); const output=new Output({format,target}); const mode=ui.audioMode.value;
    const videoOptions={codec:'avc',quality:new Quality('high'),rotate:crop?0:state.rotation,allowRotationMetadata:false,hardwareAcceleration:'prefer-hardware',forceTranscode:true};
    if(crop){
      const fullWidth=state.rotation%180?height:width,fullHeight=state.rotation%180?width:height;
      const sourceCanvas=document.createElement('canvas');sourceCanvas.width=width;sourceCanvas.height=height;const sourceContext=sourceCanvas.getContext('2d',{alpha:false});
      const rotatedCanvas=document.createElement('canvas');rotatedCanvas.width=fullWidth;rotatedCanvas.height=fullHeight;const rotatedContext=rotatedCanvas.getContext('2d',{alpha:false});
      const canvas=document.createElement('canvas');canvas.width=crop.width;canvas.height=crop.height;const context=canvas.getContext('2d',{alpha:false});
      if(!sourceContext||!rotatedContext||!context)throw new Error('画面トリミング用Canvasを作成できません');
      videoOptions.process=sample=>{
        sourceContext.clearRect(0,0,width,height);sample.draw(sourceContext,0,0,width,height);
        rotatedContext.setTransform(1,0,0,1,0,0);rotatedContext.clearRect(0,0,fullWidth,fullHeight);
        if(state.rotation===90){rotatedContext.translate(fullWidth,0);rotatedContext.rotate(Math.PI/2);}
        else if(state.rotation===180){rotatedContext.translate(fullWidth,fullHeight);rotatedContext.rotate(Math.PI);}
        else if(state.rotation===270){rotatedContext.translate(0,fullHeight);rotatedContext.rotate(-Math.PI/2);}
        rotatedContext.drawImage(sourceCanvas,0,0);
        context.clearRect(0,0,crop.width,crop.height);context.drawImage(rotatedCanvas,crop.left,crop.top,crop.width,crop.height,0,0,crop.width,crop.height);
        return canvas;
      };
      videoOptions.processedWidth=crop.width;videoOptions.processedHeight=crop.height;
      setStatus(`画面を ${crop.width}×${crop.height} に切り抜いて書き出します…`);
    }
    const options={input:state.input,output,tracks:'primary',trim:{start:Number(ui.trimStart.value),end:Number(ui.trimEnd.value)},video:videoOptions,audio:audioCodec?{codec:'aac',quality:new Quality({bitrate:192000}),forceTranscode:mode!=='none',...(mode!=='none'?{process:processAudio,processedNumberOfChannels:2}:{})}:{discard:true}};
    state.conversion=await Conversion.init(options);if(!state.conversion.isValid)throw new Error('変換できないトラックがあります');
    state.conversion.onProgress=value=>{ui.progress.value=Math.round(value*100);ui.progressLabel.textContent=`${Math.round(value*100)}%`;setStatus(`端末内でMP4を書き出し中… ${Math.round(value*100)}%`);};
    await state.conversion.execute(); const blob=new Blob([target.buffer],{type:'video/mp4'}); const outName=state.file.name.replace(/\.[^.]+$/,'')+'_edited.mp4';
    state.outputFile=new File([blob],outName,{type:'video/mp4'}); state.outputUrl=URL.createObjectURL(blob); ui.saveButton.hidden=false;
    ui.progress.value=100;ui.progressLabel.textContent='完了';setStatus(`書き出し完了: ${(blob.size/1024/1024).toFixed(1)} MiB。「完成したMP4を保存・共有」を押してください。`);
  }catch(error){if(error?.name!=='ConversionCanceledError')setStatus(`書き出し失敗: ${error.message}`);ui.progress.value=0;ui.progressLabel.textContent='停止/失敗';}
  finally{state.conversion=null;setBusy(false);}
}

async function saveOutput(){
  if(!state.outputFile)return;
  try{
    if(navigator.canShare?.({files:[state.outputFile]})){
      await navigator.share({files:[state.outputFile],title:'VeilFrame Lite 書き出し'});
      setStatus(`保存・共有画面を開きました: ${state.outputFile.name}`);
      showToast('保存が完了しました');
    }else{
      const link=document.createElement('a'); link.href=state.outputUrl; link.download=state.outputFile.name; document.body.appendChild(link); link.click(); link.remove();
      setStatus(`MP4の保存を開始しました: ${state.outputFile.name}`);
      showToast('保存を開始しました');
    }
  }catch(error){
    if(error?.name!=='AbortError') setStatus(`保存画面を開けませんでした: ${error.message}`);
  }
}

ui.fileInput.addEventListener('change',event=>openFile(event.target.files[0]));
ui.playButton.addEventListener('click',()=>{if(!state.file)return;ui.video.paused?ui.video.play():ui.video.pause();});ui.video.addEventListener('click',()=>ui.playButton.click());
ui.seekBar.addEventListener('input',()=>{if(state.file){ui.video.currentTime=Number(ui.seekBar.value);updatePlayback();}});ui.video.addEventListener('timeupdate',updatePlayback);ui.video.addEventListener('play',updatePlayback);ui.video.addEventListener('pause',updatePlayback);ui.video.addEventListener('ended',updatePlayback);
ui.rotateLeft.addEventListener('click',()=>{state.rotation=(state.rotation+270)%360;updateRotation();});ui.rotateRight.addEventListener('click',()=>{state.rotation=(state.rotation+90)%360;updateRotation();});ui.rotationReset.addEventListener('click',()=>{state.rotation=0;updateRotation();});
ui.cropToggle.addEventListener('click',()=>{state.cropEnabled=true;ui.cropPanel.hidden=false;ui.cropBox.hidden=false;ui.cropReset.hidden=false;ui.cropToggle.textContent='切り抜き範囲を調整中';updateCrop();});ui.cropReset.addEventListener('click',resetCrop);
ui.cropApply.addEventListener('click',()=>{state.cropEnabled=true;ui.cropPanel.hidden=true;ui.cropBox.hidden=false;ui.cropReset.hidden=false;ui.cropToggle.textContent='画面トリミング設定済み・変更';updateCrop();showToast('切り抜き範囲を確定しました');setStatus(`${ui.cropInfo.textContent}で書き出します。`);});
for(const item of [ui.cropLeft,ui.cropRight,ui.cropTop,ui.cropBottom])item.addEventListener('input',updateCrop);
ui.video.addEventListener('loadedmetadata',updateCrop);window.addEventListener('resize',updateCrop);
ui.trimStart.addEventListener('input',updateTrim);ui.trimEnd.addEventListener('input',updateTrim);ui.startHere.addEventListener('click',()=>{ui.trimStart.value=ui.video.currentTime;updateTrim();});ui.endHere.addEventListener('click',()=>{ui.trimEnd.value=ui.video.currentTime;updateTrim();});ui.trimReset.addEventListener('click',()=>{ui.trimStart.value=0;ui.trimEnd.value=state.duration;updateTrim();});
ui.analyzeAudio.addEventListener('click',analyzeAudio);ui.exportButton.addEventListener('click',exportVideo);ui.saveButton.addEventListener('click',saveOutput);ui.cancelButton.addEventListener('click',async()=>{if(state.conversion){setStatus('処理を停止中…');await state.conversion.cancel();}});
