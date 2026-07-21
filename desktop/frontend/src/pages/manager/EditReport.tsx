import {
    useParams
} from "react-router-dom";


function EditReport() {

    const {
        id
    } = useParams();


    return (

        <section>

            <h1>
                Sửa báo cáo
            </h1>


            <p>

                Mã báo cáo:
                {" "}
                {
                    id
                    ||
                    "---"
                }

            </p>


            <p>
                Chức năng sửa báo cáo đang được phát triển.
            </p>

        </section>

    );

}


export default EditReport;