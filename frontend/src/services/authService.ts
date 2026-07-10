import api from "../api/axios";

export const login = async (username: string, password: string) => {

    const response = await api.post("/auth/login", {
        username,
        password,
    });

    return response.data;
};