# KTC Microsoft Store - TEST application

Branch: feature/microsoft-store-msix-test (created from GitHub branch test).

This isolated experimental Microsoft Store APPX packaging pipeline uses the TEST source code, bundles the TEST frontend by running desktop/scripts/buildBundledFrontend.cjs, and keeps ktcDeploymentEnvironment=test. It does not modify test, main or existing NSIS/portable releases. APPX is not MSIX; do not rename the file to .msix.

Run Actions > KTC Microsoft Store TEST (Bundled FE) on this branch (or inspect the auto-triggered build). The build must pass automated checks and then be installed and tested on a Windows machine before Store submission. Check login, backend environment, template files, Excel export and file permissions; Store distribution changes the update mechanism compared with the existing Electron updater.

Partner Center Store ID: 9N221TXWSK83. Check package identity and publisher against the current Partner Center page. Set private audience/visibility before submitting. A hidden listing alone does not restrict which devices can install. This is a TEST build and points to TEST services; do not present it as production.

As this branch is based on a snapshot of test, subsequent commits to test are not automatically incorporated. Refresh deliberately before each release.
