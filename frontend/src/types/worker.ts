import type { UserRole } from "./auth";


export interface WorkerProfile {

    worker_id: number;

    user_id: number;

    worker_code: string;

    phone: string | null;

    department: string | null;

    status: "active" | "inactive";

    created_at: string;

    username: string;

    full_name: string;

    role: UserRole;

}


export interface WorkerProfileResponse {

    success: boolean;

    data: WorkerProfile;

    message?: string;

}