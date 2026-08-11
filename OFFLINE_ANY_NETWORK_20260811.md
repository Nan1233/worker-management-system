# KTC Offline / Any-network worker flow

- Worker form no longer gates access by company Wi-Fi/IP. Wi-Fi, 4G and 5G are accepted.
- When offline, previously cached worker/master data is reused from a user-scoped persistent snapshot.
- Reports submitted offline are queued locally with `client_request_id` and automatically retried when Internet returns.
- A fresh device still needs one successful online load to seed worker/master data.
- UI distinguishes local offline save from successful server submission.
