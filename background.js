let lastFormTabId = null;

async function openOrFocusTab(existingTabId, url) {
  if (existingTabId) {
    try {
      const tab = await chrome.tabs.get(existingTabId);
      if (tab?.id) {
        await chrome. tabs.update(tab.id, {active: true, url});
        return tab.id;
      }
    } catch {
      // Ignorar si falla
    }
  }
  const tab = await chrome.tabs.create({url});
  return tab.id;
}

chrome.action. onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("form.html");
  lastFormTabId = await openOrFocusTab(lastFormTabId, url);
});

async function findExistingNotebookTab() {
  const tabs = await chrome. tabs.query({});
  for (const tab of tabs) {
    if (tab.url && tab.url.includes("notebooklm.google.com")) {
      return tab;
    }
  }
  return null;
}

async function openResultTab(draftId) {
  const url = chrome.runtime.getURL(`result.html?draftId=${encodeURIComponent(draftId)}`);
  await chrome.tabs.create({url});
}

async function notifyFormReportReady(draftId) {
  if (!lastFormTabId) return;
  try {
    await chrome.tabs.sendMessage(lastFormTabId, {type: "REPORT_READY", draftId});
  } catch {
    // Formulario cerrado/no disponible
  }
}

chrome. runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== "analizar-protocolo") return;
  if (sender?. tab?.id) lastFormTabId = sender?. tab?.id;

  (async () => {
    try {
      const protocoloText = request.protocoloText;
      const draftId = String(Date.now());

      const notebookTab = await findExistingNotebookTab();
      if (!notebookTab?.id) {
        sendResponse({ok:  false, error:  "Abre el servicio de análisis en otra pestaña"});
        return;
      }

      await chrome.storage.local.set({
        ["draft:" + draftId]: {
          createdAt: new Date().toISOString(),
          protocoloText,
          reportText:  "",
          finalReady: false
        }
      });

      await chrome.tabs.sendMessage(notebookTab.id, {
        type: "NBLM_START",
        draftId,
        protocoloText
      });

      sendResponse({ok: true, draftId});
    } catch (e) {
      sendResponse({ok: false, error: "Error al procesar la solicitud"});
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((request) => {
  if (request. type !== "NBLM_REPORT_FINAL") return;

  (async () => {
    const {draftId, reportText} = request;
    if (!draftId) return;

    const key = "draft:" + draftId;
    const data = await chrome.storage.local. get(key);
    const item = data[key];
    if (!item) return;

    const fullReport = reportText + "\n\n---\n\nNota: Este análisis constituye un conjunto de hipótesis clínicas preliminares que requieren la validación obligatoria de un profesional capacitado. El juicio clínico del evaluador es ineludible para integrar estos hallazgos mediante el estudio de recurrencias y convergencias con la batería diagnóstica completa. Una interpretación automatizada no sustituye la escucha analítica necesaria para captar la singularidad del sujeto.";

    await chrome.storage.local.set({
      [key]: {
        ...item,
        reportText: fullReport,
        finalReady: true,
        updatedAt: new Date().toISOString()
      }
    });

    await openResultTab(draftId);
    await notifyFormReportReady(draftId);
  })();
});