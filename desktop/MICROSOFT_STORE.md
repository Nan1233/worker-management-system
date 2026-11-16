# KTC Microsoft Store packaging (experimental)

This branch adds a separate Windows Store APPX packaging target, a supported Windows app package format accepted by Microsoft Store. It does not yet produce a .msix or .msixupload file. The existing NSIS and portable EXE targets are unchanged.

Partner Center Store ID: 9N221TXWSK83. Identity name and publisher in electron-builder.store.json were copied from Partner Center; confirm them against the live Product Identity page before submission.

Run GitHub Actions > KTC Microsoft Store package (Windows) > Run workflow on this branch. Download the artifact after a successful build. This workflow has not yet been run or validated on Windows.

IMPORTANT: The app has native Excel export, custom Documents paths and electron-updater. Test installation, authentication, Excel export, templates, file permissions, and updates on a Windows machine before submission. Check Microsoft Store policy and package certification. Configure private audience / visibility in Partner Center BEFORE publishing; a hidden listing is not a device access restriction. Do not submit a test-environment build as production.

If Partner Center specifically requires MSIX, use an MSIX-capable packaging pipeline instead of renaming the .appx extension.
