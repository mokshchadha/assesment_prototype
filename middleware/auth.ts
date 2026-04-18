import Elysia from "elysia";
import { verifyJwt, extractBearerToken } from "../utils/jwt";

export const authMiddleware = new Elysia({ name: "auth-middleware" }).derive(
	{ as: "global" },
	async ({ headers, set, request }) => {
		const url = new URL(request.url);

		const isPublic =
			url.pathname === "/health" ||
			url.pathname.startsWith("/auth/") ||
			url.pathname === "/ws";

		if (isPublic) {
			return { jwtPayload: null };
		}

		const token = extractBearerToken(headers["authorization"]);
		if (!token) {
			set.status = 401;
			throw new Error("missing token");
		}

		const payload = await verifyJwt(token);
		if (!payload) {
			set.status = 401;
			throw new Error("invalid or expired token");
		}

		return { jwtPayload: payload };
	},
);
