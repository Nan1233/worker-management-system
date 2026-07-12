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


    const isManager = role === "manager";


    return (

        <header className="header">


            <div className="header-left">

                <h2>
                    {
                        isManager
                        ? "KTC Management"
                        : "KTC Worker"
                    }
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

                        {
                            isManager
                            ? "Quản lý"
                            : "Công nhân"
                        }

                    </strong>



                    <small>

                        {
                            isManager
                            ? "Đang quản lý sản xuất"
                            : "Đang làm việc"
                        }

                    </small>


                </div>


            </div>



        </header>

    );

}


export default Header;