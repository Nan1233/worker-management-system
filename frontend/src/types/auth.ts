export type UserRole =
    | "admin"
    | "admin_ops"
    | "manager"
    | "lead"
    | "worker";


export interface User {

    id: number;

    worker_id?: number | null;

    worker_code?: string | null;

    username: string;

    full_name: string;

    role: UserRole;

}

export interface LoginResponse {

    success: boolean;

    message: string;

    token?: string;

    accessToken: string;

    refreshToken?: string;

    expiresIn?: string;

    user: User;

}