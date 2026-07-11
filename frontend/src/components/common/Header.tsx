import "./Header.css";

function Header() {
    const today = new Date().toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });

    return (
        <header className="header">

            <div className="header-left">

                <h2>KTC Worker</h2>

                <span>{today}</span>

            </div>

            <div className="user-box">

                <div className="avatar">
                    👤
                </div>

                <div className="user-info">

                    <strong>Công nhân</strong>

                    <small>Đang làm việc</small>

                </div>

            </div>

        </header>
    );
}

export default Header;