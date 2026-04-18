let _server: any | null = null;

export function setServer(server: any): void {
	_server = server;
}

export function publish(topic: string, message: unknown): void {
	_server?.publish(topic, JSON.stringify(message));
}
