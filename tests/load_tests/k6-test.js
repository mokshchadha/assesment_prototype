import http from "k6/http";
import ws from "k6/ws";
import { check } from "k6";

const BASE_URL = "http://localhost:3000";
const WS_URL = "ws://localhost:3000/ws";

export const options = {
	scenarios: {
		events_load: {
			executor: "ramping-vus",
			startVUs: 10,
			stages: [
				{ duration: "30s", target: 100 },
				{ duration: "30s", target: 300 },
				{ duration: "30s", target: 600 },
				{ duration: "30s", target: 1000 },
				{ duration: "30s", target: 1500 },
				{ duration: "30s", target: 0 },
			],
			exec: "httpLoad",
		},
		ws_load: {
			executor: "ramping-vus",
			startVUs: 10,
			stages: [
				{ duration: "30s", target: 50 },
				{ duration: "30s", target: 100 },
				{ duration: "30s", target: 200 },
				{ duration: "30s", target: 300 },
				{ duration: "30s", target: 400 },
				{ duration: "30s", target: 0 },
			],
			startTime: "5s",
			exec: "wsLoad",
		},
	},
	thresholds: {
		http_req_duration: ["p(95)<2000"],
		http_req_failed: ["rate<0.05"],
	},
};

function getHeaders(token) {
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${token}`,
	};
}

function buildEventPayload() {
	return JSON.stringify({
		region: "Asia",
		payload: {
			type: "spam_report",
			severity: "high",
			user_id: `user-${__VU}-${__ITER}`,
			timestamp: new Date().toISOString(),
		},
	});
}

function buildWsUrl(data) {
	return `${WS_URL}?name=${data.name}&region=${data.region}&token=${data.token}`;
}

function handleWsMessage(msg) {
	const p = JSON.parse(msg);
	if (p.type === "available_events") {
		check(p, {
			"[WS] received available_events": (p) => p.type === "available_events",
		});
	}
}

export function setup() {
	const res = http.post(
		`${BASE_URL}/auth/login`,
		JSON.stringify({ name: "moksh", region: "Asia" }),
		{ headers: { "Content-Type": "application/json" } },
	);

	if (res.status !== 200) {
		console.error(`Setup login failed: ${res.body}`);
		return null;
	}

	const data = res.json();
	console.log(`Setup complete, token obtained for user moksh.`);
	return { token: data.token, name: data.name, region: data.region };
}

export function httpLoad(data) {
	if (!data?.token) return;

	const res = http.post(`${BASE_URL}/events/`, buildEventPayload(), {
		headers: getHeaders(data.token),
	});

	check(res, {
		"[HTTP] status is 201 created": (r) => r.status === 201,
		"[HTTP] has event id": (r) => r.json("id") !== undefined,
	});
}

export function wsLoad(data) {
	if (!data?.token) return;

	const res = ws.connect(buildWsUrl(data), null, (socket) => {
		socket.on("open", () => console.log(`[WS] VU ${__VU} connected`));
		socket.on("message", handleWsMessage);
		socket.on("close", () => console.log(`[WS] VU ${__VU} disconnected`));
		socket.on("error", (e) => {
			if (e.error() !== "websocket: close sent") {
				console.error(`[WS] VU ${__VU} error: ${e.error()}`);
			}
		});

		socket.setTimeout(() => socket.close(), 4500);
	});

	check(res, { "[WS] status is 101": (r) => r && r.status === 101 });
}
