import "./Header.css";

function Header() {

    const today = new Date().toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });


    const user =
        JSON.parse(
            localStorage.getItem("user") || "{}"
        );


    const role = user.role;


    const roleInfo: Record<string, { title: string; name: string; status: string }> = {
        admin: { title: "KTC Administration", name: "Quản trị viên", status: "Toàn quyền quản lý hệ thống" },
        manager: { title: "KTC Management", name: "Quản lý", status: "Đang quản lý sản xuất" },
        lead: { title: "KTC Lead", name: "Tổ trưởng", status: "Đang theo dõi và duyệt sản xuất" },
        worker: { title: "KTC Worker", name: "Công nhân", status: "Đang làm việc" },
    };

    const currentRole = roleInfo[role] || roleInfo.worker;


    return (

        <header className="header">


            <div className="header-left">

                <h2>
                    {currentRole.title}
                </h2>


                <span>
                    {today}
                </span>


            </div>



            <div className="user-box">


                <div className="avatar">
                    👤
                </div>



                <div className="user-info">


                    <strong>

                        {currentRole.name}

                    </strong>



                    <small>

                        {currentRole.status}

                    </small>


                </div>


            </div>



        </header>

    );

}


export default Header;