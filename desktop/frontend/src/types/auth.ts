export type UserRole =
    | "admin"
    | "manager"
    | "lead"
    | "worker";


export interface User {

    id: number;

    worker_id?: number | null;

    username: string;

    full_name: string;

    role: UserRole;

}

export interface LoginResponse {

    success: boolean;

    message: string;

    token?: string;

    accessToken: string;

    refreshToken: string;

    expiresIn?: string;

    user: User;

}