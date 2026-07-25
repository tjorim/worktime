/**
 * Phone-side companion for the Worktime watch app.
 *
 * All Worktime API calls happen here, not on the watch: the watch only
 * exchanges small AppMessage payloads with this file. Configuration (API
 * base URL + personal access token, generated in Worktime under
 * Settings > Account > API tokens) is collected via a webview and cached
 * in pkjs's localStorage.
 *
 * Change CONFIG_URL if you're self-hosting Worktime somewhere other than
 * the default deployment.
 */
var CONFIG_URL = "https://worktime.tjor.im/pebble-config.html";
var CONFIG_STORAGE_KEY = "worktimeConfig";

var REQUEST_START = 1;
var REQUEST_STOP = 2;

function loadConfig() {
	try {
		var raw = localStorage.getItem(CONFIG_STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch (error) {
		return null;
	}
}

function saveConfig(config) {
	localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function apiUrl(config, path) {
	return config.apiBaseUrl.replace(/\/$/, "") + path;
}

function sendToWatch(payload) {
	Pebble.sendAppMessage(payload, function () {}, function (error) {
		console.log("Worktime: failed to send AppMessage: " + JSON.stringify(error));
	});
}

function sendError(message) {
	sendToWatch({ ERROR: message });
}

function statusFromTask(task) {
	if (!task) {
		return { RUNNING: 0, TASK_TEXT: "", START_TIME: 0 };
	}
	return {
		RUNNING: task.stop_time ? 0 : 1,
		TASK_TEXT: task.text || "",
		START_TIME: Math.floor(new Date(task.start_time).getTime() / 1000),
	};
}

function request(config, method, path, body, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open(method, apiUrl(config, path));
	xhr.setRequestHeader("Authorization", "Bearer " + config.token);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onload = function () {
		if (xhr.status === 204) {
			callback(null, null);
		} else if (xhr.status >= 200 && xhr.status < 300) {
			callback(null, JSON.parse(xhr.responseText));
		} else if (xhr.status === 401 || xhr.status === 403) {
			callback("Sign-in needed");
		} else {
			callback("Error " + xhr.status);
		}
	};
	xhr.onerror = function () {
		callback("Network error");
	};
	xhr.send(body ? JSON.stringify(body) : undefined);
}

function refreshStatus(config) {
	request(config, "GET", "/api/time-tracking/tasks/running", null, function (error, task) {
		if (error) {
			sendError(error);
			return;
		}
		sendToWatch(statusFromTask(task));
	});
}

function startTask(config) {
	var body = { text: "Working", start_time: new Date().toISOString() };
	request(config, "POST", "/api/time-tracking/tasks", body, function (error, task) {
		if (error) {
			sendError(error);
			return;
		}
		sendToWatch(statusFromTask(task));
	});
}

function stopRunningTask(config) {
	request(config, "GET", "/api/time-tracking/tasks/running", null, function (error, task) {
		if (error) {
			sendError(error);
			return;
		}
		if (!task) {
			// Nothing running (e.g. stopped from another device already).
			sendToWatch(statusFromTask(null));
			return;
		}
		request(
			config,
			"PUT",
			"/api/time-tracking/tasks/" + task.id,
			{ stop_time: new Date().toISOString() },
			function (updateError, updatedTask) {
				if (updateError) {
					sendError(updateError);
					return;
				}
				sendToWatch(statusFromTask(updatedTask));
			},
		);
	});
}

function handleRequest(kind) {
	var config = loadConfig();
	if (!config || !config.apiBaseUrl || !config.token) {
		sendError("Not configured");
		return;
	}
	if (kind === REQUEST_START) {
		startTask(config);
	} else if (kind === REQUEST_STOP) {
		stopRunningTask(config);
	} else {
		refreshStatus(config);
	}
}

Pebble.addEventListener("ready", function () {
	console.log("Worktime: pkjs ready");
});

Pebble.addEventListener("appmessage", function (e) {
	handleRequest(e.payload.REQUEST);
});

Pebble.addEventListener("showConfiguration", function () {
	var config = loadConfig();
	var prefilledBaseUrl = (config && config.apiBaseUrl) || "";
	Pebble.openURL(CONFIG_URL + "?apiBaseUrl=" + encodeURIComponent(prefilledBaseUrl));
});

Pebble.addEventListener("webviewclosed", function (e) {
	if (!e.response) return;
	try {
		var result = JSON.parse(decodeURIComponent(e.response));
		if (result.apiBaseUrl && result.token) {
			saveConfig({ apiBaseUrl: result.apiBaseUrl, token: result.token });
		}
	} catch (error) {
		console.log("Worktime: failed to parse configuration response: " + error);
	}
});
