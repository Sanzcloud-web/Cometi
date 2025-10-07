chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setOptions({
      path: 'sidepanel.html',
    });
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (error) {
    console.error('Erreur lors de la configuration du panneau latéral :', error);
  }
});
