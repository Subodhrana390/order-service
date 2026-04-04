import axios from "axios";
export const createInternalClient = (baseUrl, timeout = 5000) => {
    const client = axios.create({
        baseURL: baseUrl,
        timeout,
    });
    return client;
};
