export interface User {

    id: number;

    username: string;

    full_name: string;

    role: "admin" | "manager" | "worker";

}

export interface LoginResponse {

    token: string;

    user: User;

}