'use strict';
const userModel=require('../models/userModel');

function findExactUserByUsername(username) {
    return new Promise((resolve, reject) => {
        userModel.findExactByUsername(username, (error, results) => {
            if (error) return reject(error);
            resolve(results || []);
        });
    });
}

function findUsersByWorkerCode(workerCode) {
    return new Promise((resolve, reject) => {
        userModel.findAllByWorkerCode(workerCode, (error, results) => {
            if (error) return reject(error);
            resolve(results || []);
        });
    });
}

async function resolveLoginAccount(loginName, accessType = null) {
    // Worker login uses an employee code, so resolve the linked workers profile
    // before checking an exact username. This prevents an orphan users row whose
    // username equals a worker code from shadowing the real worker account.
    if (accessType === "worker") {
        const workerUsers = await findUsersByWorkerCode(loginName);
        if (workerUsers.length === 1) {
            return { user: workerUsers[0], ambiguous: false, matchedBy: "worker_code" };
        }
        if (workerUsers.length > 1) {
            return {
                user: null,
                ambiguous: true,
                matchedBy: "worker_code",
                usernames: workerUsers.map((item) => item.username)
            };
        }
    }

    // Management / legacy login retains exact-username priority.
    const exactUsers = await findExactUserByUsername(loginName);
    if (exactUsers.length > 0) {
        return { user: exactUsers[0], ambiguous: false, matchedBy: "username" };
    }

    // Legacy fallback: resolve by employee code when no exact username exists.
    const workerUsers = await findUsersByWorkerCode(loginName);
    if (workerUsers.length === 1) {
        return { user: workerUsers[0], ambiguous: false, matchedBy: "worker_code" };
    }
    if (workerUsers.length > 1) {
        return {
            user: null,
            ambiguous: true,
            matchedBy: "worker_code",
            usernames: workerUsers.map((item) => item.username)
        };
    }
    return { user: null, ambiguous: false, matchedBy: null };
}

module.exports={resolveLoginAccount};
