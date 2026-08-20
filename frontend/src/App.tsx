import "./basic.css";
import "./pages/Login.css";
import "./pages/admin/MasterData.css";
import "./pages/admin/Governance.css";
import "./pages/admin/Permissions.css";
import "./pages/admin/FormulaSettings.css";
import "./pages/manager/Dashboard.css";
import "./pages/manager/Reports.css";
import "./pages/manager/ReportDetail.css";
import "./pages/manager/EditReport.css";
import "./pages/manager/ReportDownload.css";
import "./pages/manager/SelectedReportsReview.css";
import "./pages/manager/Workers.css";
import "./pages/worker/SelectProcess.css";
import "./pages/worker/ProcessPage.css";
import "./pages/worker/ProductionHistory.css";
import "./pages/worker/ProductionDetail.css";
import "./pages/system/SystemCenter.css";
import "./reference-ui.css";

import DesktopExcelDbSyncNotifier from "./components/DesktopExcelDbSyncNotifier";
import AppRouter from "./routes/AppRouter";
import NetworkStatusBanner from "./components/system/NetworkStatusBanner";

function App() {
    return <>
        <DesktopExcelDbSyncNotifier />
        <NetworkStatusBanner />
        <AppRouter />
    </>;
}

export default App;
