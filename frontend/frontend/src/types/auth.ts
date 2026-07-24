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

    message: string;

    token: string;

    user: User;

}