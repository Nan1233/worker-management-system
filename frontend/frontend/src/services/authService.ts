import api from "../api/axios";
import type { LoginResponse } from "../types/auth";

export const login = async (
    username: string,
    password: string
): Promise<LoginResponse> => {
    const res = await api.post("/auth/login", {
        username,
        password,
    });

    return res.data;
};