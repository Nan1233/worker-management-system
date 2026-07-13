import {NavLink} from "react-router-dom";

import {menuConfig} from "../../config/menuConfig";

import "./MobileNavbar.css";


interface Props{

role:string;

}



function MobileNavbar({role}:Props){


const menus=menuConfig[role] || [];



return (

<nav className="mobile-navbar">


{

menus.map(item=>(


<NavLink

key={item.path}

to={item.path}

end={item.end}

>


<span>

{item.icon}

</span>


{item.label}


</NavLink>


))


}


</nav>


)

}


export default MobileNavbar;