let observer=null;
let startedAtMs=0;
let finalized=false;

function getPromptTextarea(){
  let el=document.querySelector('textarea[aria-label="Cuadro de consulta"]');
  if(el)return el;

  el=document.querySelector("textarea.query-box-input");
  if(el)return el;

  const textareas=document.querySelectorAll("textarea");
  for(const ta of textareas){
    if(ta.offsetParent!==null&&ta.clientHeight>30){
      return ta;
    }
  }

  return null;
}

function normalizeText(s){
  return(s||"")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[""]/g,'"')
    .replace(/['']/g,"'")
    .replace(/\s+/g," ")
    .trim();
}

const ANCHORS=[
  "fin del informe",
  "i. encuadre e implementacion",
  "i encuadre e implementacion",
  "ii. mecanismos instrumentales (funcionamiento yoico)",
  "ii mecanismos instrumentales (funcionamiento yoico)",
  "ii. mecanismos instrumentales",
  "iii. manejo y tipos de ansiedad",
  "iii manejo y tipos de ansiedad",
  "iv. secuencia de reinos y fantasias de muerte",
  "iv secuencia de reinos y fantasias de muerte",
  "v. analisis estructural (ello, yo, superyo)",
  "v analisis estructural (ello, yo, superyo)",
  "v. analisis estructural",
  "vi. perspectiva adl (algoritmo david liberman)",
  "vi perspectiva adl (algoritmo david liberman)",
  "vi. perspectiva adl",
  "vii. hipotesis diagnostica y pronostico",
  "vii hipotesis diagnostica y pronostico",
  "represion fundante",
  "identificacion proyectiva",
  "racionalizacion",
  "tipo de distribucion",
  "tipos de distribucion",
  "algoritmo david liberman",
  "li, o1, o2, a1, a2, fu, fg",
  "li,o1,o2,a1,a2,fu,fg",
  "neurosis",
  "psicosis",
  "psicopatia",
  "1 disociacion",
  "2 disociacion"
];

function countAnchors(normalizedText){
  let count=0;
  for(const a of ANCHORS){
    if(normalizedText.includes(a))count++;
  }
  return count;
}

function hasFinalMarker(normalizedText){
  return normalizedText.includes("fin del informe");
}

function extractLikelyAnswerText(){
  const selectors=[
    "main",
    "[role='main']",
    ".response-container",
    ".answer-content",
    "article",
    "section"
  ];

  const blocks=[];
  
  for(const selector of selectors){
    const elements=document.querySelectorAll(selector);
    for(const el of elements){
      const text=el.innerText?.trim();
      if(text&&text.length>400){
        blocks.push(text);
      }
    }
  }

  blocks.sort((a,b)=>b.length-a.length);
  return blocks[0]||"";
}

function stop(){
  if(observer){
    observer.disconnect();
  }
  observer=null;
}

function startObservingFinal(draftId){
  finalized=false;
  stop();

  let lastGoodCandidate="";
  let checkCount=0;
  const MAX_CHECKS=500;

  observer=new MutationObserver(()=>{
    if(finalized)return;
    if(!startedAtMs)return;

    checkCount++;
    if(checkCount>MAX_CHECKS){
      console.warn("Límite de verificaciones alcanzado");
      stop();
      return;
    }

    const candidate=extractLikelyAnswerText();
    if(!candidate)return;

    const normalized=normalizeText(candidate);

    if(countAnchors(normalized)<5)return;

    lastGoodCandidate=candidate;

    if(hasFinalMarker(normalized)){
      finalized=true;
      stop();
      chrome.runtime.sendMessage({
        type:"NBLM_REPORT_FINAL",
        draftId,
        reportText:lastGoodCandidate
      });
    }
  });

  const targetNode=document.querySelector("main")||document.body;
  observer.observe(targetNode,{
    childList:true,
    subtree:true,
    characterData:true
  });
}

function sendPromptWithEnter(text){
  const el=getPromptTextarea();
  if(!el){
    console.error("No se encontró el cuadro de consulta");
    return false;
  }

  el.focus();
  el.value=text;
  
  el.dispatchEvent(new Event("input",{bubbles:true}));
  el.dispatchEvent(new Event("change",{bubbles:true}));

  el.dispatchEvent(
    new KeyboardEvent("keydown",{
      bubbles:true,
      cancelable:true,
      key:"Enter",
      code:"Enter"
    })
  );
  el.dispatchEvent(
    new KeyboardEvent("keyup",{
      bubbles:true,
      cancelable:true,
      key:"Enter",
      code:"Enter"
    })
  );

  return true;
}

chrome.runtime.onMessage.addListener((request,sender,sendResponse)=>{
  if(request.type!=="NBLM_START")return;

  const{draftId,protocoloText}=request;
  startedAtMs=Date.now();

  const ok=sendPromptWithEnter(protocoloText);
  if(ok){
    startObservingFinal(draftId);
  }

  if(sendResponse)sendResponse({ok});
  return true;
});