/**
 * Worktime companion watch app — time tracking clock in/out + active task glance.
 *
 * Talks to the phone-side pkjs companion (../pkjs/index.js) over AppMessage.
 * pkjs owns the actual Worktime API calls; this file only renders state and
 * relays button presses.
 */
import {} from "piu/MC";
import Message from "pebble/message";
import Button from "pebble/button";

const REQUEST_REFRESH = 0;
const REQUEST_START = 1;
const REQUEST_STOP = 2;

function formatElapsed(totalSeconds) {
	const pad = (n) => (n < 10 ? "0" + n : "" + n);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
}

const WorktimeApp = Application.template($ => ({
	skin: new Skin({ fill: "white" }),
	contents: [
		Label($, {
			anchor: "STATUS",
			left: 0, right: 0, top: 40, height: 40,
			style: new Style({ font: "bold 24px Gothic", color: "black" }),
			string: "Loading…",
		}),
		Label($, {
			anchor: "TIMER",
			left: 0, right: 0, top: 90, height: 36,
			style: new Style({ font: "28px Gothic", color: "black" }),
			string: "",
		}),
		Label($, {
			left: 0, right: 0, bottom: 12, height: 20,
			style: new Style({ font: "16px Gothic", color: "gray" }),
			string: "SELECT: clock in/out",
		}),
	],
	Behavior: class extends Behavior {
		onCreate(application, data) {
			this.data = data;
			this.running = false;
			this.taskText = "";
			this.startTime = 0;
			this.lastTick = -1;
		}
		onDisplaying(application) {
			application.start();
			requestStatus(application, REQUEST_REFRESH);
		}
		// Called by the Message "onReadable" handler below with the latest
		// status payload from pkjs.
		applyStatus(payload) {
			clearPending();
			const error = payload.get("ERROR");
			if (error) {
				this.running = false;
				this.data.STATUS.string = error;
				this.data.TIMER.string = "";
				return;
			}
			this.running = payload.get("RUNNING") === 1;
			this.taskText = payload.get("TASK_TEXT") || "";
			this.startTime = payload.get("START_TIME") || 0;
			this.data.STATUS.string = this.running ? this.taskText || "Working" : "Not clocked in";
			if (!this.running) {
				this.data.TIMER.string = "";
				this.lastTick = -1;
			}
		}
		onTimeChanged(application) {
			if (!this.running) return;
			const now = Math.floor(Date.now() / 1000);
			if (now === this.lastTick) return;
			this.lastTick = now;
			this.data.TIMER.string = formatElapsed(Math.max(0, now - this.startTime));
		}
		onSelectPressed(application) {
			if (isPending()) return;
			this.data.STATUS.string = this.running ? "Clocking out…" : "Clocking in…";
			requestStatus(application, this.running ? REQUEST_STOP : REQUEST_START);
		}
	},
}));

let pendingRequest = false;
function isPending() {
	return pendingRequest;
}
function clearPending() {
	pendingRequest = false;
}

const message = new Message({
	keys: ["REQUEST", "RUNNING", "TASK_TEXT", "START_TIME", "ERROR"],
	onReadable() {
		application.behavior.applyStatus(this.read());
	},
});

function requestStatus(application, kind) {
	if (pendingRequest && kind !== REQUEST_REFRESH) return;
	pendingRequest = true;
	message.write(new Map([["REQUEST", kind]]));
}

new Button({
	types: ["select"],
	onPush(down, type) {
		if (down && type === "select") {
			application.behavior.onSelectPressed(application);
		}
	},
});

const application = new WorktimeApp(null, {});
