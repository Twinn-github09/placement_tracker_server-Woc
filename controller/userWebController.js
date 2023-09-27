const { db } = require('../connection')

const webTokenGenerator = require('../middleware/webTokenGenerator');
const webTokenValidator = require('../middleware/webTokenValidator');
const otpTokenGenerator = require('../middleware/otpTokenGenerator');
const [otpTokenValidator,resetPasswordValidator] = require('../middleware/otpTokenValidator');

const generateOTP = require("../middleware/otpGenerator");
const passwordGenerator = require('secure-random-password');

const crypto = require('crypto');

const mailer = require('../mail/mailer');

const fs = require('fs');
const validator = require('validator');
const tokenValidator = require('../middleware/webTokenValidator');

module.exports = {
    test: async (req, res) => {
        return res.status(200).send({ "message": 'Ok' });
    },

    toggleOfficialAccountStatus: [
        /*
        Headers: {
            "Authorization": "Bearer <SECRET_TOKEN>"
        }

        JSON
        {
            "managerId": "<manager_id>",
            "accountStatus": "<0/1/2>"
        }
        */
        webTokenValidator,
        async (req, res) => {
            if (req.body.userRole === null || req.body.userRole === undefined || req.body.userRole === "" || req.body.userEmail === null || req.body.userEmail === undefined || req.body.userEmail === "" || !validator.isEmail(req.body.userEmail) || req.body.userRole !== "1") {
                return res.status(400).send({ "message": "Access Restricted!" });
            }

            if (req.body.managerId === null || req.body.managerId === undefined || req.body.managerId === "" || req.body.accountStatus === null || req.body.accountStatus === undefined || req.body.accountStatus === "") {
                return res.status(400).send({ "message": "Missing details." });
            }

            if (req.body.accountStatus !== "0" && req.body.accountStatus !== "1" && req.body.accountStatus !== "2") {
                return res.status(400).send({ "message": "Invalid account status!" });
            }

            let db_connection = await db.promise().getConnection();

            try {

                await db_connection.query(`LOCK TABLES managementData WRITE`);

                // check if actually admin
                let [admin] = await db_connection.query(`SELECT * from managementData WHERE managerEmail = ? AND managerRole = ?`, [req.body.userEmail, "1"]);

                if (admin.length === 0) {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(401).send({ "message": "Access Restricted!" });
                }

                // check if manager exists.

                let [manager] = await db_connection.query(`SELECT * from managementData WHERE id = ?`, [req.body.managerId]);

                if (manager.length === 0) {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(400).send({ "message": "Manager doesn't exist!" });
                }

                // 2 -> 0, 0 -> 2, 1 -> 2
                // Only the manager themselves can change their account status from 0 to 1.
                if ((manager[0].accountStatus === "2" && req.body.accountStatus === "0") || (manager[0].accountStatus === "0" && req.body.accountStatus === "2") || (manager[0].accountStatus === "1" && req.body.accountStatus === "2")) {
                    await db_connection.query(`UPDATE managementData SET accountStatus = ? WHERE id = ?`, [req.body.accountStatus, req.body.managerId]);
                    await db_connection.query(`UNLOCK TABLES`);

                    if (req.body.accountStatus === "2") {
                        // send mail
                        mailer.accountDeactivated(manager[0].managerName, manager[0].managerEmail);
                    }

                    return res.status(200).send({ "message": "Account status updated!", "accountStatus": req.body.accountStatus });
                }

                await db_connection.query(`UNLOCK TABLES`);
                return res.status(400).send({ "message": "Action not permitted" });

            } catch (err) {
                console.log(err);
                const time = new Date();
                fs.appendFileSync('logs/errorLogs.txt', `${time.toISOString()} - toggleOfficialAccountStatus - ${err}\n`);
                return res.status(500).send({ "message": "Internal Server Error." });
            }

        }
    ],

    getRegisteredOfficials: [
        webTokenValidator,
        async (req, res) => {
            if (req.body.userRole === null || req.body.userRole === undefined || req.body.userRole === "" || req.body.userEmail === null || req.body.userEmail === undefined || req.body.userEmail === "" || !validator.isEmail(req.body.userEmail) || req.body.userRole !== "1") {
                return res.status(400).send({ "message": "Access Restricted!" });
            }

            let db_connection = await db.promise().getConnection();

            try {
                await db_connection.query(`LOCK TABLES managementData READ`);

                // check if actually admin
                let [admin] = await db_connection.query(`SELECT * from managementData WHERE managerEmail = ? AND managerRole = ?`, [req.body.userEmail, "1"]);

                if (admin.length === 0) {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(401).send({ "message": "Access Restricted!" });
                }

                // select all fields except password.

                let [managers] = await db_connection.query(`SELECT id, managerEmail, managerName, managerRole, createdAt, accountStatus from managementData WHERE managerRole = ?`, ["0"]);

                if (managers.length === 0) {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(200).send({ "message": "No managers registered!", "managers": [] });
                }

                await db_connection.query(`UNLOCK TABLES`);
                return res.status(200).send({ "message": "Managers fetched!", "managers": managers });

            } catch (err) {
                console.log(err);
                const time = new Date();
                fs.appendFileSync('logs/errorLogs.txt', `${time.toISOString()} - getRegisteredOfficials - ${err}\n`);
                return res.status(500).send({ "message": "Internal Server Error." });
            } finally {
                await db_connection.query(`UNLOCK TABLES`);
                db_connection.release();
            }
        },
    ],

    registerOfficial: [
        /*
        Headers: {
            "Authorization": "Bearer <SECRET_TOKEN>"
        }
        JSON
        {
            "managerEmail": "<email_id>",
            "managerName": "<name>",
        }
        */
        webTokenValidator,
        async (req, res) => {
            if (req.body.userRole === null || req.body.userRole === undefined || req.body.userRole === "" || req.body.userEmail === null || req.body.userEmail === undefined || req.body.userEmail === "" || !validator.isEmail(req.body.userEmail) || req.body.userRole !== "1") {
                return res.status(400).send({ "message": "Access Restricted!" });
            }

            if (req.body.managerEmail === null || req.body.managerEmail === undefined || req.body.managerEmail === "" || !validator.isEmail(req.body.managerEmail) || req.body.managerName === null || req.body.managerName === undefined || req.body.managerName === "") {
                return res.status(400).send({ "message": "Missing details." });
            }

            let db_connection = await db.promise().getConnection();

            try {
                // check if the manager is already registered.
                await db_connection.query(`LOCK TABLES managementData WRITE, studentData READ`);

                // check if actually admin
                let [admin] = await db_connection.query(`SELECT * from managementData WHERE managerEmail = ? AND managerRole = ?`, [req.body.userEmail, "1"]);

                if (admin.length === 0) {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(401).send({ "message": "Access Restricted!" });
                }

                let [manager] = await db_connection.query(`SELECT * from managementData WHERE managerEmail = ?`, [req.body.managerEmail]);
                let [student] = await db_connection.query(`SELECT * from studentData WHERE studentEmail = ?`, [req.managerEmail]);
                if (manager.length > 0 || student.length > 0) {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(400).send({ "message": "Manager already registered!" });
                }

                // generate a random password for the manager.
                const managerPassword = passwordGenerator.randomPassword({
                    length: 8,
                    characters: [passwordGenerator.lower, passwordGenerator.upper, passwordGenerator.digits]
                });

                // sha256 hash the password.
                const passwordHashed = crypto.createHash('sha256').update(managerPassword).digest('hex');

                // Email the password to the manager.
                mailer.officialCreated(req.body.managerName, req.body.managerEmail, managerPassword);
                // console.log(managerPassword);
                // console.log(passwordHashed);

                await db_connection.query(`INSERT INTO managementData (managerEmail, managerName, managerPassword, managerRole, createdAt, accountStatus) VALUES (?, ?, ?, ?, ?, ?)`, [req.body.managerEmail, req.body.managerName, passwordHashed, "0", new Date(), "0"]);

                await db_connection.query(`UNLOCK TABLES`);

                return res.status(200).send({ "message": "Manager registered!" });
            } catch (err) {
                console.log(err);
                const time = new Date();
                fs.appendFileSync('logs/errorLogs.txt', `${time.toISOString()} - registerOfficial - ${err}\n`);
                return res.status(500).send({ "message": "Internal Server Error." });
            } finally {
                await db_connection.query(`UNLOCK TABLES`);
                db_connection.release();
            }
        },
    ],
    
    studentRegister: async (req, res) => {
        /*
        JSON
        {
            "studentRollNo": "<roll_no>",
            "studentEmail": "<email_id>",
            "studentName": "<name>",
            "studentPassword": "<password>",
            "studentSection": "<section>",
            "studentGender": "<M/F/O>"
            "studentBatch": "<batch>",
            "studentDept": "<dept>",
            "isHigherStudies": "<0/1>",
            "isPlaced": "<0/1>",
            "CGPA": "<XX.XX>"
        }
        */

        if (req.body.studentEmail === null || req.body.studentEmail === undefined || req.body.studentEmail === "" || !validator.isEmail(req.body.studentEmail) || req.body.studentPassword === null || req.body.studentPassword === undefined || req.body.studentPassword === "") {
            return res.status(400).send({ "message": "Missing details." });
        }

        if (req.body.studentRollNo === null || req.body.studentRollNo === undefined || req.body.studentRollNo === "" || req.body.studentName === null || req.body.studentName === undefined || req.body.studentName === "" || req.body.studentSection === null || req.body.studentSection === undefined || req.body.studentSection === "" || req.body.studentGender === null || req.body.studentGender === undefined || req.body.studentGender === "" || req.body.studentBatch === null || req.body.studentBatch === undefined || req.body.studentBatch === "" || req.body.studentDept === null || req.body.studentDept === undefined || req.body.studentDept === "" || req.body.isHigherStudies === null || req.body.isHigherStudies === undefined || req.body.isHigherStudies === "" || req.body.isPlaced === null || req.body.isPlaced === undefined || req.body.isPlaced === "" || req.body.CGPA === null || req.body.CGPA === undefined || req.body.CGPA === "") {
            return res.status(400).send({ "message": "Missing details." });
        }

        if (req.body.studentGender !== "M" && req.body.studentGender !== "F" && req.body.studentGender !== "O") {
            return res.status(400).send({ "message": "Missing details." });
        }

        if (req.body.isHigherStudies !== "0" && req.body.isHigherStudies !== "1") {
            return res.status(400).send({ "message": "Missing details." });
        }

        if (req.body.isPlaced !== "0" && req.body.isPlaced !== "1") {
            return res.status(400).send({ "message": "Missing details." });
        }

        if (parseFloat(req.body.CGPA) < 0 || parseFloat(req.body.CGPA) > 10) {
            return res.status(400).send({ "message": "Missing details." });
        }

        if (req.body.studentEmail.split("@")[1] !== "cb.students.amrita.edu") {
            return res.status(400).send({ "message": "Missing details." });
        }

        let db_connection = await db.promise().getConnection();

        try {
            await db_connection.query(`LOCK TABLES studentData READ, managementData READ`);

            // check if student email already registered
            const [student] = await db_connection.query(`SELECT * from studentData WHERE studentEmail = ? or studentRollNo = ?`, [req.body.studentEmail, req.body.studentRollNo]);
            const [manager] = await db_connection.query(`SELECT * from managementData WHERE managerEmail = ?`, [req.body.studentEmail]);
            if (student.length > 0 || manager.length > 0) {
                await db_connection.query(`UNLOCK TABLES`);
                return res.status(400).send({ "message": "Student already registered!" });
            }

            const otp = generateOTP();

            await db_connection.query(`LOCK TABLES studentRegister WRITE`);

            let [student_2] = await db_connection.query(`SELECT * from studentRegister WHERE studentEmail = ?`, [req.body.studentEmail]);

            if (student_2.length === 0) {
                await db_connection.query(`INSERT INTO studentRegister (studentEmail, otp, createdAt) VALUES (?, ?, ?)`, [req.body.studentEmail, otp, new Date()]);
            } else {
                await db_connection.query(`UPDATE studentRegister SET otp = ?, createdAt = ? WHERE studentEmail = ?`, [otp, new Date(), req.body.studentEmail]);
            }



            const secret_token = await otpTokenGenerator({
                "userEmail": req.body.studentEmail,
                "userRole": "2",
                "studentRollNo": req.body.studentRollNo,
                "studentName": req.body.studentName,
                "studentPassword": req.body.studentPassword,
                "studentSection": req.body.studentSection,
                "studentGender": req.body.studentGender,
                "studentBatch": req.body.studentBatch,
                "studentDept": req.body.studentDept,
                "isHigherStudies": req.body.isHigherStudies,
                "isPlaced": req.body.isPlaced,
                "CGPA": req.body.CGPA
            });

            //console.log(req.body.studentEmail, otp);
            mailer.loginOTP(req.body.studentName, otp, req.body.studentEmail);
            await db_connection.query(`UNLOCK TABLES`);

            return res.status(200).send({
                "message": "OTP sent to email.",
                "SECRET_TOKEN": secret_token,
                "studentEmail": req.body.studentEmail,
                "studentRollNo": req.body.studentRollNo,
            });

        } catch (err) {
            console.log(err);
            const time = new Date();
            fs.appendFileSync('logs/errorLogs.txt', `${time.toISOString()} - studentRegister - ${err}\n`);
            return res.status(500).send({ "message": "Internal Server Error." });
        } finally {
            await db_connection.query(`UNLOCK TABLES`);
            db_connection.release();
        }
    },

    studentVerify: [
        otpTokenValidator,
        async (req, res) => {
            if (req.authorization_tier !== "2" || req.body.studentEmail === null || req.body.studentEmail === undefined ||
                req.body.studentEmail === "" || !validator.isEmail(req.body.studentEmail) ||
                req.body.studentRollNo === null || req.body.studentRollNo === undefined || req.body.studentRollNo === "" ||
                req.body.studentPassword === null || req.body.studentPassword === undefined || req.body.studentPassword === "" ||
                req.body.otp === null || req.body.otp === undefined || req.body.otp === "") {
                return res.status(400).send({ "message": "Access Restricted!" });
            }

            let db_connection = await db.promise().getConnection();
            try {
                await db_connection.query(`LOCK TABLES studentRegister WRITE, studentData WRITE`);

                //let check = await db_connection.query(`Delete from studentRegister where studentEmail = ? and otp = ?`, [req.body.studentEmail,req.body.otp]);
                //console.log(check);
                const [check_1] = await db_connection.query(`Delete from studentRegister where studentEmail = ? and otp = ?`, [req.body.studentEmail, req.body.otp]);
                if (check_1.affectedRows === 0) {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(400).send({ "message": "Invalid OTP!" });
                }

                let [student] = await db_connection.query(`SELECT * from studentData WHERE studentEmail = ? or studentRollNo = ?`, [req.body.studentEmail, req.body.studentRollNo]);

                if (student.length > 0) {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(400).send({ "message": "Student already registered!" });
                }
                else {
                    await db_connection.query(`INSERT INTO studentData (studentRollNo, studentEmail, studentName, studentPassword, studentSection, studentGender, studentBatch, studentDept, isHigherStudies, isPlaced, CGPA, createdAt, studentAccountStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [req.body.studentRollNo, req.body.studentEmail, req.body.studentName, req.body.studentPassword, req.body.studentSection, req.body.studentGender, req.body.studentBatch, req.body.studentDept, req.body.isHigherStudies, req.body.isPlaced, req.body.CGPA, new Date(), "1"]);
                    await db_connection.query(`UNLOCK TABLES`);
                }

                const secret_token = await webTokenGenerator({
                    "userEmail": req.body.studentEmail,
                    "userRole": "2"
                });

                return res.status(200).send({
                    "message": "Student verifed successfully!",
                    "SECRET_TOKEN": secret_token,
                    "studentEmail": req.body.studentEmail,
                    "studentName": req.body.studentName,
                    "studentRollNo": req.body.studentRollNo,
                    "studentId": req.body.id,
                    "studentSection": req.body.studentSection,
                    "studentGender": req.body.studentGender,
                    "studentBatch": req.body.studentBatch,
                    "studentDept": req.body.studentDept,
                    "isHigherStudies": req.body.isHigherStudies,
                    "isPlaced": req.body.isPlaced,
                    "CGPA": req.body.CGPA
                });

            } catch (err) {
                console.log(err);
                const time = new Date();
                fs.appendFileSync('logs/errorLogs.txt', `${time.toISOString()} - studentVerify - ${err}\n`);
                return res.status(500).send({ "message": "Internal Server Error." });
            } finally {
                await db_connection.query(`UNLOCK TABLES`);
                db_connection.release();
            }

        }
    ],

    userLogin: async (req, res) => {
        /*
        JSON
        {
            "userEmail": "<email_id>",
            "userPassword": "<password>"
        }
        */
        if (req.body.userEmail === null || req.body.userEmail === undefined || req.body.userEmail === "" || !validator.isEmail(req.body.userEmail) || req.body.userPassword === null || req.body.userPassword === undefined || req.body.userPassword === "") {
            return res.status(400).send({ "message": "Missing details." });
        }

        let db_connection = await db.promise().getConnection();

        try {
            await db_connection.query(`LOCK TABLES studentData READ, managementData READ`);

            let [student] = await db_connection.query(`SELECT * from studentData WHERE studentEmail = ? AND studentPassword = ?`, [req.body.userEmail, req.body.userPassword]);

            if (student.length > 0) {
                const secret_token = await webTokenGenerator({
                    "userEmail": req.body.userEmail,
                    "userRole": "2",
                });

                await db_connection.query(`UNLOCK TABLES`);

                return res.status(200).send({
                    "message": "Student logged in!",
                    "SECRET_TOKEN": secret_token,
                    "studentEmail": student[0].studentEmail,
                    "studentName": student[0].studentName,
                    "studentRollNo": student[0].studentRollNo,
                    "studentId": student[0].id,
                    "studentSection": student[0].studentSection,
                    "studentGender": student[0].studentGender,
                    "studentBatch": student[0].studentBatch,
                    "studentDept": student[0].studentDept,
                    "isHigherStudies": student[0].isHigherStudies,
                    "isPlaced": student[0].isPlaced,
                    "CGPA": student[0].CGPA
                });
            }

            let [manager] = await db_connection.query(`SELECT * from managementData WHERE managerEmail = ? AND managerPassword = ?`, [req.body.userEmail, req.body.userPassword]);

            if (manager.length > 0) {
                if (manager[0].accountStatus === "2") {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(401).send({ "message": "Your Account has been deactivated. Check you mail for further instructions." });
                }

                if (manager[0].accountStatus === "0") {
                    // send otp to the manager's email. First time verification.
                    const otp = generateOTP();

                    await db_connection.query(`LOCK TABLES managementRegister WRITE`);

                    let [manager_2] = await db_connection.query(`SELECT * from managementRegister WHERE managerEmail = ?`, [req.body.userEmail]);

                    if (manager_2.length === 0) {
                        await db_connection.query(`INSERT INTO managementRegister (managerEmail, otp, createdAt) VALUES (?, ?, ?)`, [req.body.userEmail, otp, new Date()]);
                    } else {
                        await db_connection.query(`UPDATE managementRegister SET otp = ?, createdAt = ? WHERE managerEmail = ?`, [otp, new Date(), req.body.userEmail]);
                    }



                    // send mail
                    mailer.loginOTP(manager[0].managerName, otp, manager[0].managerEmail);

                    const secret_token = await otpTokenGenerator({
                        "userEmail": manager[0].managerEmail,
                        "userRole": manager[0].managerRole,
                    });

                    await db_connection.query(`UNLOCK TABLES`);

                    return res.status(200).send({
                        "message": "First time login! OTP sent to email.",
                        "SECRET_TOKEN": secret_token,
                        "managerEmail": manager[0].managerEmail,
                        "managerName": manager[0].managerName,
                    });
                }

                const secret_token = await webTokenGenerator({
                    "userEmail": req.body.userEmail,
                    "userRole": manager[0].managerRole,
                });

                await db_connection.query(`UNLOCK TABLES`);

                return res.status(200).send({
                    "message": "Manager logged in!",
                    "SECRET_TOKEN": secret_token,
                    "managerEmail": manager[0].managerEmail,
                    "managerName": manager[0].managerName,
                    "managerRole": manager[0].managerRole,
                    "managerId": manager[0].id,
                    "accountStatus": manager[0].accountStatus,
                });
            }

            await db_connection.query(`UNLOCK TABLES`);

            return res.status(400).send({ "message": "Invalid email or password!" });
        } catch (err) {
            console.log(err);
            const time = new Date();
            fs.appendFileSync('logs/errorLogs.txt', `${time.toISOString()} - userLogin - ${err}\n`);
            return res.status(500).send({ "message": "Internal Server Error." });
        } finally {
            await db_connection.query(`UNLOCK TABLES`);
            db_connection.release();
        }
    },

    loginVerify: [
        otpTokenValidator,
        async (req, res) => {
            if (req.authorization_tier !== "0" || req.managerEmail === null || req.managerEmail === undefined || req.managerEmail === "" || !validator.isEmail(req.managerEmail) || req.body.otp === null || req.body.otp === undefined || req.body.otp === "") {
                return res.status(400).send({ "message": "Access Restricted!" });
            }

            let db_connection = await db.promise().getConnection();

            try {

                await db_connection.query(`LOCK TABLES managementRegister WRITE, managementData WRITE`);

                let [check_1] = await db_connection.query(`DELETE from managementRegister WHERE managerEmail = ? AND otp = ?`, [req.managerEmail, req.body.otp]);

                if (check_1.affectedRows === 0) {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(400).send({ "message": "Invalid OTP!" });
                }

                let [manager] = await db_connection.query(`SELECT * from managementData WHERE managerEmail = ?`, [req.managerEmail]);


                if (manager.length === 0) {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(400).send({ "message": "Manager doesn't exist!" });
                }

                await db_connection.query(`UPDATE managementData SET accountStatus = ? WHERE managerEmail = ?`, ["1", req.managerEmail]);

                await db_connection.query(`UNLOCK TABLES`);

                const secret_token = await webTokenGenerator({
                    "userEmail": req.managerEmail,
                    "userRole": manager[0].managerRole,
                });

                return res.status(200).send({
                    "message": "Manager verifed successfully!",
                    "SECRET_TOKEN": secret_token,
                    "managerEmail": manager[0].managerEmail,
                    "managerName": manager[0].managerName,
                    "managerRole": manager[0].managerRole,
                    "managerId": manager[0].id,
                    "accountStatus": manager[0].accountStatus,
                });

            } catch (err) {
                console.log(err);
                const time = new Date();
                fs.appendFileSync('logs/errorLogs.txt', `${time.toISOString()} - loginVerify - ${err}\n`);
                return res.status(500).send({ "message": "Internal Server Error." });
            } finally {
                await db_connection.query(`UNLOCK TABLES`);
                db_connection.release();
            }

        }
    ],

    forgotPassword: async (req, res) => {
        /*
        JSON
        {
            "userEmail": "<email_id>"
        }
        */
        if (req.body.userEmail === null || req.body.userEmail === undefined || req.body.userEmail === "" || !validator.isEmail(req.body.userEmail)) {
            return res.status(400).send({ "message": "Missing details." });
        }

        let db_connection = await db.promise().getConnection();

        try {

            await db_connection.query(`LOCK TABLES studentData READ, managementData READ`);
            let [student] = await db_connection.query(`SELECT studentName from studentData where studentEmail = ?`, [req.body.userEmail]);
            let [manager] = await db_connection.query(`SELECT managerName,managerRole from managementData where managerEmail = ?`, [req.body.userEmail]);

            if (student.length === 0 && manager.length === 0) {
                await db_connection.query(`UNLOCK TABLES`);
                return res.status(401).send({ "message": "User doesn't exist!" });
            }
            await db_connection.query(`UNLOCK TABLES`);

            const otp = generateOTP();
            let name = "";
            let userRole="";

            if (manager.length === 0) {

                await db_connection.query(`LOCK TABLES studentRegister WRITE`);
                name = student[0]["studentName"];
                userRole = "2";
                let [student_2] = await db_connection.query(`SELECT * from studentRegister WHERE studentEmail = ?`, [req.body.userEmail]);

                if (student_2.length === 0) {
                    await db_connection.query(`INSERT INTO studentRegister (studentEmail, otp, createdAt) VALUES (?, ?, ?)`, [req.body.userEmail, otp, new Date()]);
                } else {
                    await db_connection.query(`UPDATE studentRegister SET otp = ?, createdAt = ? WHERE studentEmail = ?`, [otp, new Date(), req.body.userEmail]);
                }
                await db_connection.query(`UNLOCK TABLES`);
            } else {
                await db_connection.query(`LOCK TABLES managementRegister WRITE`);
                name = manager[0]["managerName"];
                userRole = manager[0]["managerRole"];
                let [manager_2] = await db_connection.query(`SELECT * from managementRegister WHERE managerEmail = ?`, [req.body.userEmail]);

                if (manager_2.length === 0) {
                    await db_connection.query(`INSERT INTO managementRegister (managerEmail, otp, createdAt) VALUES (?, ?, ?)`, [req.body.userEmail, otp, new Date()]);
                } else {
                    await db_connection.query(`UPDATE managementRegister SET otp = ?, createdAt = ? WHERE managerEmail = ?`, [otp, new Date(), req.body.userEmail]);
                }
                await db_connection.query(`UNLOCK TABLES`);
            }
            //console.log(name);

            const secret_token = await otpTokenGenerator({
                "userEmail": req.body.userEmail,
                "userRole": userRole
            });

            mailer.reset_PW_OTP(name, otp, req.body.userEmail);

            return res.status(200).send({
                "message": "OTP sent to email.",
                "SECRET_TOKEN": secret_token,
                "studentEmail": req.body.userEmail
            });


        } catch (err) {
            console.log(err);
            const time = new Date();
            fs.appendFileSync('logs/errorLogs.txt', `${time.toISOString()} - forgotPassword - ${err}\n`);
            return res.status(500).send({ "message": "Internal Server Error." });
        } finally {
            await db_connection.query(`UNLOCK TABLES`);
            db_connection.release();
        }

    },

    resetPasswordVerify: [
        resetPasswordValidator,
        async (req, res) => {
            if((req.authorization_tier !== "2" && req.authorization_tier !== "1" && req.authorization_tier !== "0") || req.body.userEmail === null || req.body.userEmail === undefined || req.body.userEmail === "" || !validator.isEmail(req.body.userEmail) || req.body.otp === null || req.body.otp === undefined || req.body.otp === "") {
                return res.status(400).send({ "message": "Access Restricted!" });
            }
        
            let db_connection = await db.promise().getConnection();

            try {

                await db_connection.query(`LOCK TABLES studentRegister WRITE, managementRegister WRITE, studentData WRITE, managementData WRITE`);

                let check_1 = null;
                if (req.authorization_tier === "2") {
                    [check_1] = await db_connection.query(`DELETE from studentRegister WHERE studentEmail = ? AND otp = ?`, [req.body.userEmail, req.body.otp]);
                } else if (req.authorization_tier === "1" || req.authorization_tier === "0") {
                    [check_1] = await db_connection.query(`DELETE from managementRegister WHERE managerEmail = ? AND otp = ?`, [req.body.userEmail, req.body.otp]);
                }

                if (check_1.affectedRows === 0) {
                    await db_connection.query(`UNLOCK TABLES`);
                    return res.status(400).send({ "message": "Invalid OTP!" });
                }

                await db_connection.query(`UNLOCK TABLES`);
            
                const secret_token = await webTokenGenerator({  
                    "userEmail": req.body.userEmail,
                    "userRole": req.authorization_tier
                });

                return res.status(200).send({
                    "message": "Otp verified successfully!",
                    "SECRET_TOKEN": secret_token
                });

            } catch (err) {
                console.log(err);
                const time = new Date();
                fs.appendFileSync('logs/errorLogs.txt', `${time.toISOString()} - resetPassword - ${err}\n`);
                return res.status(500).send({ "message": "Internal Server Error." });
            } finally {
                await db_connection.query(`UNLOCK TABLES`);
                db_connection.release();
            }
        }],

    resetPassword: [
        tokenValidator,
        async (req, res) => {
            if((req.authorization_tier !== "2" && req.authorization_tier !== "1" && req.authorization_tier !== "0") || req.body.userEmail === null || req.body.userEmail === undefined || req.body.userEmail === "" || !validator.isEmail(req.body.userEmail) || req.body.userPassword === null || req.body.userPassword === undefined || req.body.userPassword === "") {
                return res.status(400).send({ "message": "Access Restricted!" });
            }
        
            let db_connection = await db.promise().getConnection();

            try {

                await db_connection.query(`LOCK TABLES studentData WRITE, managementData WRITE`);

                if (req.authorization_tier === "2") {
                    await db_connection.query(`UPDATE studentData SET studentPassword = ? WHERE studentEmail = ?`, [req.body.userPassword, req.body.userEmail]);
                } else if (req.authorization_tier === "1" || req.authorization_tier === "0") {
                    await db_connection.query(`UPDATE managementData SET managerPassword = ? WHERE managerEmail = ?`, [req.body.userPassword, req.body.userEmail]);
                }

                await db_connection.query(`UNLOCK TABLES`);
                    
                return res.status(200).send({
                    "message": "Password reset successfully!",
                    "userEmail": req.body.userEmail
                });

            } catch (err) {
                console.log(err);
                const time = new Date();
                fs.appendFileSync('logs/errorLogs.txt', `${time.toISOString()} - resetPassword - ${err}\n`);
                return res.status(500).send({ "message": "Internal Server Error." });
            } finally {
                await db_connection.query(`UNLOCK TABLES`);
                db_connection.release();
            }
        }
    ]

}