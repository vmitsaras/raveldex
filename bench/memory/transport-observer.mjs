// Browser/worker measurement wrapper. Records primitives, never envelopes.
export function observeTransport(native, realm) {
  if (!['main','worker'].includes(realm)) throw Error('Unknown observation realm');
  const rows=[], listeners=new Map(); let sends=0, reads=0, dropped=0;
  const post=native.postMessage.bind(native), add=native.addEventListener.bind(native), remove=native.removeEventListener.bind(native);
  function note(data,direction,sequence,argumentCount) {
    if(rows.length>=2048){dropped++;return;}
    rows.push({realm,direction,sequence,argumentCount,id:Number.isSafeInteger(data?.id)?data.id:null,
      operation:typeof data?.operation==='string'?data.operation:null,kind:typeof data?.kind==='string'?data.kind:null,
      inputStringCodeUnits:typeof data?.payload?.input==='string'?data.payload.input.length:null,valueStringCodeUnits:typeof data?.value==='string'?data.value.length:null});
  }
  const mark=(direction,sequence,edge)=>performance.mark(`rx:transport:${realm}:${direction}:${sequence}:${edge}`);
  const endpoint={
    postMessage(...args){const sequence=++sends;mark('send',sequence,'begin');try{return post(...args);}finally{mark('send',sequence,'end');note(args[0],'send',sequence,args.length);}},
    addEventListener(type,listener,...options){
      if(type!=='message'||listener===null)return add(type,listener,...options);
      // The actual adapters register each message listener once, without options.
      if(options.length)throw Error('Observation supports adapter message listeners without options');
      let wrapped=listeners.get(listener);
      if(!wrapped){wrapped=function(event){const sequence=++reads;mark('read',sequence,'begin');let data;
        try{data=event.data;}finally{mark('read',sequence,'end');}note(data,'read',sequence,null);
        if(typeof listener==='function')return listener.call(this,event);return listener.handleEvent(event);
      };listeners.set(listener,wrapped);}
      return add(type,wrapped);
    },
    removeEventListener(type,listener,...options){if(type!=='message')return remove(type,listener,...options);const wrapped=listeners.get(listener);listeners.delete(listener);return remove(type,wrapped??listener,...options);},
    terminate(){return native.terminate?.();},
  };
  return{endpoint,snapshot:()=>({realm,rows:rows.map(row=>({...row})),dropped,messageListeners:listeners.size})};
}
