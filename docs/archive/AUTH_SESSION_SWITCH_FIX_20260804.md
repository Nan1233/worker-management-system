# Auth session switch fix

Version 1.8.6 prevents an in-flight refresh request from restoring the previous account after a new login.

Changes:
- abort and invalidate pending refresh before login;
- clear the old local session before submitting login;
- send login through an isolated Axios request without the old Authorization header;
- ignore stale refresh responses by auth generation and refresh-token identity;
- disable proactive/401 refresh while switching accounts;
- do not bootstrap-refresh while on the login route.
