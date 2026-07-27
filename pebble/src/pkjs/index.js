// Phone-side Alloy network proxy and runtime configuration handoff.
const moddableProxy = require("@moddable/pebbleproxy");

const CONFIG_URL = "https://worktime.tjor.im/pebble-config.html";
const CONFIG_STORAGE_KEY = "worktimePebbleConfig";

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.log(`Worktime: failed to load configuration: ${error}`);
    return null;
  }
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function sendConfigToWatch(config) {
  if (!config || !config.apiBaseUrl || !config.token) return;
  Pebble.sendAppMessage(
    {
      API_BASE_URL: config.apiBaseUrl,
      AUTH_TOKEN: config.token,
    },
    function () {
      console.log("Worktime: configuration relayed to watch");
    },
    function (error) {
      console.log(`Worktime: failed to relay configuration: ${JSON.stringify(error)}`);
    },
  );
}

Pebble.addEventListener("ready", function (event) {
  moddableProxy.readyReceived(event);
  sendConfigToWatch(loadConfig());
});

Pebble.addEventListener("appmessage", function (event) {
  if (moddableProxy.appMessageReceived(event)) return;
});

Pebble.addEventListener("showConfiguration", function () {
  const config = loadConfig();
  const baseUrl = config && config.apiBaseUrl ? config.apiBaseUrl : "";
  Pebble.openURL(`${CONFIG_URL}?apiBaseUrl=${encodeURIComponent(baseUrl)}`);
});

Pebble.addEventListener("webviewclosed", function (event) {
  if (!event.response) return;
  try {
    const result = JSON.parse(decodeURIComponent(event.response));
    if (!result.apiBaseUrl || !result.token) return;
    const config = {
      apiBaseUrl: result.apiBaseUrl.replace(/\/$/, ""),
      token: result.token,
    };
    saveConfig(config);
    sendConfigToWatch(config);
  } catch (error) {
    console.log(`Worktime: failed to parse configuration response: ${error}`);
  }
});
