import { useNavigate } from "react-router-dom";

const processes = [
    {
        id: "gia-cong",
        name: "Gia công"
    },
    {
        id: "mai",
        name: "Mài"
    },
    {
        id: "kiem-1",
        name: "Kiểm 1"
    },
    {
        id: "kiem-2",
        name: "Kiểm 2"
    },
    {
        id: "ep",
        name: "Ép"
    },
    {
        id: "can",
        name: "Cán"
    },
    {
        id: "bavia",
        name: "Bavia"
    }
];

function SelectProcess() {

    const navigate = useNavigate();

    return (

        <div>

            <h2
                style={{
                    textAlign: "center",
                    marginBottom: 25
                }}
            >
                Chọn công đoạn
            </h2>

            {
                processes.map((item) => (

                    <button
                        key={item.id}
                        onClick={() =>
                            navigate(`/worker/process/${item.id}`)
                        }
                        style={{
                            width: "100%",
                            padding: "18px",
                            marginBottom: "15px",
                            borderRadius: "10px",
                            border: "1px solid #ddd",
                            cursor: "pointer",
                            background: "#1976d2",
                            color: "white",
                            fontSize: "18px"
                        }}
                    >
                        {item.name}
                    </button>

                ))
            }

        </div>

    );

}

export default SelectProcess;