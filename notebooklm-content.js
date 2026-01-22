// notebooklm-content.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "NBLM_START") {
    ejecutarEnvio(request.protocoloText, request.draftId);
    sendResponse({ ok: true });
  }
  return true;
});

async function ejecutarEnvio(text, draftId) {
  const box = document.querySelector('textarea[aria-label*="consulta"]') || 
              document.querySelector('div[contenteditable="true"]');
  if (!box) return;

  box.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, text);

  await new Promise(r => setTimeout(r, 600));

  const btn = document.querySelector('button[aria-label*="Enviar"]') || 
              document.querySelector('button[aria-label*="Send"]');
  if (btn) btn.click();

  // Iniciar vigilancia después de enviar
  iniciarMonitoreo(draftId);
}

function iniciarMonitoreo(draftId) {
  let lastText = "";
  let checkTicks = 0;

  const interval = setInterval(() => {
    const blocks = document.querySelectorAll('.response-text, [role="article"], .markdown-content');
    const lastBlock = blocks[blocks.length - 1];
    const isThinking = document.querySelector('button[aria-label*="Detener"], button[aria-label*="Stop"]');
    const sendBtn = document.querySelector('button[aria-label*="Enviar"], button[aria-label*="Send"]');

    if (!lastBlock) return;

    const currentText = lastBlock.innerText;
    const normalized = currentText.toUpperCase().replace(/[*_#]/g, "");

    // ANCLAS DE DETECCIÓN
    const anclaTexto = normalized.includes("FIN DEL INFORME") || 
                       normalized.includes("FIN DEL ANÁLISIS") || 
                       normalized.includes("CORDIALMENTE");
    
    // ANCLA DE INTERFAZ: El botón de enviar volvió y el texto ya no crece
    const anclaInterfaz = !isThinking && sendBtn && currentText.length > 500 && currentText === lastText;

    if (anclaTexto || anclaInterfaz) {
      checkTicks++;
      if (checkTicks >= 3) { // Confirmación de seguridad
        clearInterval(interval);
        comunicarFinal(draftId, currentText);
      }
    } else {
      lastText = currentText;
      checkTicks = 0;
    }
  }, 800);
}

function comunicarFinal(draftId, text) {
  chrome.runtime.sendMessage({
    type: "NBLM_REPORT_FINAL",
    draftId: draftId,
    reportText: text
  }, (response) => {
    if (chrome.runtime.lastError) {
      // Si falla, reintenta en 1 segundo (el background se está despertando)
      setTimeout(() => comunicarFinal(draftId, text), 1000);
    }
  });
}