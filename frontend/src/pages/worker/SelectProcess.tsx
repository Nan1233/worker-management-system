import { useNavigate } from "react-router-dom";
import "./SelectProcess.css";

const processes = [
    {
        id: "gia-cong",
        name: "Gia công",
        icon: "⚙️",
        description: "Nhập báo cáo gia công"
    },
    {
        id: "mai",
        name: "Mài",
        icon: "🛠️",
        description: "Nhập báo cáo mài"
    },
    {
        id: "kiem-1",
        name: "Kiểm 1",
        icon: "🔍",
        description: "Kiểm tra chất lượng lần 1"
    },
    {
        id: "kiem-2",
        name: "Kiểm 2",
        icon: "✅",
        description: "Kiểm tra chất lượng lần 2"
    },
    {
        id: "ep",
        name: "Ép",
        icon: "🏭",
        description: "Nhập báo cáo ép"
    },
    {
        id: "can",
        name: "Cán",
        icon: "📦",
        description: "Nhập báo cáo cán"
    },
    {
        id: "bavia",
        name: "Bavia",
        icon: "✂️",
        description: "Nhập báo cáo bavia"
    }
];

function SelectProcess() {

    const navigate = useNavigate();

    return (
        <div className="select-process">

            <div className="page-header">

                <h2>Chọn công đoạn</h2>

                <p>
                    Chọn công đoạn bạn đang làm để bắt đầu nhập báo cáo.
                </p>

            </div>

            <div className="process-grid">

                {processes.map((item) => (

                    <div
                        key={item.id}
                        className="process-card"
                        onClick={() =>
                            navigate(`/worker/process/${item.id}`)
                        }
                    >

                        <div className="process-icon">
                            {item.icon}
                        </div>

                        <h3>{item.name}</h3>

                        <p>{item.description}</p>

                    </div>

                ))}

            </div>

        </div>
    );
}

export default SelectProcess;