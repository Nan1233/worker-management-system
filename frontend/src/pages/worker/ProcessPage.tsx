import { useParams } from "react-router-dom";

function ProcessPage() {

    const { process } = useParams();

    return (

        <div>

            <h2>
                Công đoạn: {process}
            </h2>

            <br />

            <input
                placeholder="Mã sản phẩm"
                style={{
                    width: "100%",
                    padding: 12,
                    marginBottom: 12
                }}
            />

            <input
                placeholder="Số lượng"
                type="number"
                style={{
                    width: "100%",
                    padding: 12,
                    marginBottom: 12
                }}
            />

            <input
                placeholder="Ca làm"
                style={{
                    width: "100%",
                    padding: 12,
                    marginBottom: 12
                }}
            />

            <button
                style={{
                    width: "100%",
                    padding: 15,
                    background: "#1976d2",
                    color: "white",
                    border: "none",
                    borderRadius: 8
                }}
            >
                Lưu dữ liệu
            </button>

        </div>

    );

}

export default ProcessPage;