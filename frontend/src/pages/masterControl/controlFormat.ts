// Formatting/error helpers shared by Master Control modules (kept out of component files for fast refresh).

export const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("vi-VN", { hour12: false });
};

export const formatNumber = (value?: number | null) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("vi-VN"));

export const isForbidden = (error: unknown) => {
    const status = (error as { response?: { status?: number } })?.response?.status;
    return status === 403;
};
