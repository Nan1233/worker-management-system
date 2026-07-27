import type { ReactNode } from "react";

type Props = {
    title: string;
    children: ReactNode;
};

function FormSection({
    title,
    children,
}: Props) {

    return (

        <div className="form-section">

            <div className="form-section-title">
                {title}
            </div>

            <div className="form-section-body">
                {children}
            </div>

        </div>

    );

}

export default FormSection;