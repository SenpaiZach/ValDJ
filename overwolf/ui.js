(function(){
  const statusEl = document.getElementById('status');
  const logEl = document.getElementById('log');
  const volumeEl = document.getElementById('volume');
  const setVolumeBtn = document.getElementById('setVolume');
  const eventKeyEl = document.getElementById('eventKey');
  const sendEventBtn = document.getElementById('sendEvent');

  function log(line){
    const div = document.createElement('div');
    div.className = 'line';
    div.textContent = `[${new Date().toLocaleTimeString()}] ${line}`;
    logEl.prepend(div);
  }

  async function sendMessage(type, payload){
    try {
      overwolf.windows.getMainWindow(result => {
        try {
          if (!result || !result.window) { return; }
          const wnd = result.window;
          if (wnd && wnd.valdjBridge) {
            wnd.valdjBridge.postMessage({ type, payload });
          } else {
            log('Background bridge not available yet');
          }
        } catch (e) { log('sendMessage error: ' + e.message); }
      });
    } catch(e){ log('sendMessage failed: ' + e.message); }
  }

  setVolumeBtn.addEventListener('click', () => {
    const vol = Math.max(0, Math.min(100, Number(volumeEl.value)||0));
    sendMessage('set_volume', { volumePercent: vol });
    log(`Requested volume ${vol}%`);
  });

  sendEventBtn.addEventListener('click', () => {
    const key = eventKeyEl.value;
    sendMessage('simulate_event', { key });
    log(`Simulated event ${key}`);
  });

  statusEl.textContent = 'Ready';
})();
