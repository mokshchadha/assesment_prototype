import { useAuth } from "./hooks/useAuth";
import { Login } from "./components/Login";
import { Dashboard } from "./components/Dashboard";

export default function App() {
	const { auth, login, logout } = useAuth();

	return auth ? (
		<Dashboard
			userId={auth.userId}
			name={auth.name}
			region={auth.region}
			token={auth.token}
			onLogout={logout}
		/>
	) : (
		<Login onLogin={login} />
	);
}
