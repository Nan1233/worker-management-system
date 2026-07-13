import {NavLink,useNavigate} from "react-router-dom";
import {menuConfig} from "../../config/menuConfig";

import "./Sidebar.css";


interface Props{

role:string;

}


function Sidebar({role}:Props){


const navigate=useNavigate();


const menus=menuConfig[role] || [];



return (

<aside className="sidebar">


<div className="logo">

<h2>KTC</h2>

<span>
{
role==="manager"
?
"Management System"
:
"Worker Management"
}
</span>

</div>



<nav className="sidebar-menu">


{
menus.map(item=>(


<NavLink

key={item.path}

to={item.path}

end={item.end}

className={({isActive})=>

isActive
?
"menu-item active"
:
"menu-item"

}

>


<span>{item.icon}</span>

<p>{item.label}</p>


</NavLink>


))

}


</nav>



<button

className="logout-btn"

onClick={()=>navigate("/login")}

>

🚪 Đăng xuất

</button>


</aside>

)

}


export default Sidebar;