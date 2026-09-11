// Public room speech follows the same canonical member location as the body.
export function installRoomChat(member){
  if(document.getElementById('traveller-chat'))return;
  const panel=document.createElement('details');panel.id='traveller-chat';
  panel.style.cssText='position:fixed;right:12px;bottom:12px;z-index:1000;width:min(340px,90vw);background:#142522;color:#edf5ed;padding:10px;border:1px solid #789b8c;border-radius:8px;font:14px sans-serif';
  const title=document.createElement('summary');title.textContent='Room chat';panel.append(title);
  const log=document.createElement('div');log.style.cssText='max-height:220px;overflow:auto;white-space:pre-wrap;margin:8px 0';panel.append(log);
  const input=document.createElement('textarea');input.placeholder='Say something in this room';input.style.cssText='width:100%;box-sizing:border-box';panel.append(input);
  const send=document.createElement('button');send.textContent='Send';panel.append(send);
  const note=document.createElement('div');panel.append(note);document.body.append(panel);
  for(const kind of ['keydown','keyup','pointerdown','pointerup','click'])panel.addEventListener(kind,e=>e.stopPropagation());
  let room='',generation=0,abort=null;
  async function json(path,options={}){const r=await fetch(path,options),v=await r.json();if(!r.ok||v.error)throw Error(v.error||'Room unavailable');return v;}
  function show(events){for(const e of events){if(e.kind!=='say')continue;const row=document.createElement('div');row.textContent=e.member+': '+(e.data?.text||'');log.append(row);}log.scrollTop=log.scrollHeight;}
  async function follow(){const run=++generation;abort?.abort();abort=new AbortController();
    try{const world=await json('/api/world');if(run!==generation)return;room=world.where[member]||'';log.replaceChildren();
      if(!room){title.textContent='Room chat · no current room';return;}
      const snapshot=await json('/api/rooms/'+encodeURIComponent(room));if(run!==generation)return;
      title.textContent='Room chat · '+snapshot.name;let seq=snapshot.last_seq||0;
      const history=await json(`/api/rooms/${encodeURIComponent(room)}/events?since=${Math.max(0,seq-100)}`);if(run!==generation)return;show((history.events||[]).filter(e=>e.seq<=seq));
      while(panel.open&&run===generation){const data=await json(`/api/rooms/${encodeURIComponent(room)}/events/wait?since=${seq}&member=${encodeURIComponent(member)}`,{signal:abort.signal});if(run!==generation)return;
        if((data.events||[]).some(e=>e.kind==='depart'&&e.member===member)){follow();return;}
        show(data.events||[]);for(const e of data.events||[])seq=Math.max(seq,e.seq);}
    }catch(e){if(e.name!=='AbortError')note.textContent=e.message+' · Close and reopen room chat to reconnect.';}
  }
  panel.addEventListener('toggle',()=>{if(panel.open)follow();else{generation++;abort?.abort();}});
  send.onclick=async()=>{if(!input.value.trim()||!room)return;send.disabled=true;try{await json('/api/act',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({member,action:'say',text:input.value,payload:{expected_room:room}})});input.value='';note.textContent='';}catch(e){note.textContent=e.message;}finally{send.disabled=false;}};
}
