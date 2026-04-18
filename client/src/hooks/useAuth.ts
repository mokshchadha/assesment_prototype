import { useState } from "react";
import type { Region } from "../types";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const STORAGE_KEY = "mod_auth";

export interface AuthState {
	token: string;
	userId: string;
	name: string;
	region: Region;
}

function loadStored(): AuthState | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

export function useAuth() {
	const [auth, setAuth] = useState<AuthState | null>(loadStored);

	async function login(
		name: string,
		region: Region,
	): Promise<{ error?: string }> {
		const res = await fetch(`${API}/auth/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, region }),
		});

		const data = await res.json();

		if (!res.ok) {
			return { error: data.error ?? "login failed" };
		}

		const state: AuthState = {
			token: data.token,
			userId: data.userId,
			name: data.name,
			region: data.region,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		setAuth(state);
		return {};
	}

	async function logout() {
		await fetch(`${API}/auth/logout`, {
			method: "POST",
			headers: { Authorization: `Bearer ${auth?.token}` },
		}).catch(() => {});
		localStorage.removeItem(STORAGE_KEY);
		setAuth(null);
	}

	return { auth, login, logout };
}
