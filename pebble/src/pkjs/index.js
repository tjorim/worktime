// Phone-side Alloy network proxy and runtime configuration handoff.
const moddableProxy = require("@moddable/pebbleproxy");

const CONFIG_URL = "https://worktime.tjor.im/pebble-pair";

Pebble.addEventListener("ready", function (event) {
  moddableProxy.readyReceived(event);
});

Pebble.addEventListener("appmessage", function (event) {
  if (moddableProxy.appMessageReceived(event)) return;
});

Pebble.addEventListener("showConfiguration", function () {
  Pebble.openURL(CONFIG_URL);
});

Pebble.addEventListener("webviewclosed", function (event) {
  if (!event.response) return;
  try {
    const result = JSON.parse(decodeURIComponent(event.response));
    if (!result.accessToken) return;
    // Share the proxy's queue with watch-side fetch traffic. Sending directly
    // through Pebble can exceed PKJS's small in-flight AppMessage budget.
    moddableProxy.sendAppMessage(
      {
        API_BASE_URL: "https://worktime.tjor.im",
        AUTH_TOKEN: result.accessToken
      },
      function () {
        console.log("Worktime: pairing token relayed to watch");
      },
      function (error) {
        console.log(`Worktime: failed to relay pairing token: ${JSON.stringify(error)}`);
      }
    );
  } catch (error) {
    console.log(`Worktime: failed to parse pairing response: ${error}`);
  }
});
