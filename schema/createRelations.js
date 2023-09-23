const createTables = (db) => {
    db.query(`CREATE TABLE managementData (
        id INT NOT NULL AUTO_INCREMENT,
        managerEmail VARCHAR(255) NOT NULL UNIQUE,
        managerPassword VARCHAR(255) NOT NULL,
        managerName VARCHAR(255) NOT NULL,
        managerRole CHAR(1) NOT NULL,
        createdAt DATE NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT CK_managerRole CHECK (managerRole='0' OR managerRole='1' OR managerRole='2')
    );`, (err, result) => {
        if (err) {
            console.log("[ERROR]: Failed to create managementData table");
            console.log(err);
        } else {
            console.log("[MESSAGE]: Created managementData table");
        }
    });

    db.query(`CREATE TABLE managementRegister (
        id INT NOT NULL AUTO_INCREMENT,
        managerEmail VARCHAR(255) NOT NULL UNIQUE,
        otp VARCHAR(6) NOT NULL,
        createdAt DATETIME NOT NULL,
        PRIMARY KEY (id)
    );`, (err, result) => {
        if (err) {
            console.log("[ERROR]: Failed to create managementRegister table");
            console.log(err);
        } else {
            console.log("[MESSAGE]: Created managementRegister table");
        }
    });

    db.query(`CREATE TABLE studentData (
        id INT NOT NULL AUTO_INCREMENT,
        studentRollNo CHAR(16) NOT NULL UNIQUE,
        studentEmail VARCHAR(255) NOT NULL UNIQUE,
        studentPassword VARCHAR(255) NOT NULL,
        studentName VARCHAR(255) NOT NULL,
        studentSection CHAR(1) NOT NULL,
        studentGender CHAR(1) NOT NULL,
        studentBatch CHAR(4) NOT NULL,
        studentDept VARCHAR(10) NOT NULL,
        isHigherStudies CHAR(1) NOT NULL,
        isPlaced CHAR(1) NOT NULL DEFAULT '0',
        createdAt DATE NOT NULL,
        CGPA VARCHAR(4) NULL,
        PRIMARY KEY (id),
        CONSTRAINT CK_isHigherStudies CHECK ( isHigherStudies='0' OR isHigherStudies='1'),
        CONSTRAINT CK_isPlaced CHECK ( isPlaced='0' OR isPlaced='1'),
        CONSTRAINT CK_studentGender CHECK (studentGender = 'M' OR studentGender = 'F' OR studentGender = 'O')
    );`, (err, result) => {
        if (err) {
            console.log("[ERROR]: Failed to create studentData table");
            console.log(err);
        } else {
            console.log("[MESSAGE]: Created studentData table");
        }
    });

    db.query(`CREATE TABLE studentRegister (
        id INT NOT NULL AUTO_INCREMENT,
        studentEmail VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        createdAt DATETIME NOT NULL,
        PRIMARY KEY (id)
    );`, (err, result) => {
        if (err) {
            console.log("[ERROR]: Failed to create studentRegister table");
            console.log(err);
        } else {
            console.log("[MESSAGE]: Created studentRegister table");
        }
    });



    db.query(`CREATE TABLE companyData (
        id INT NOT NULL AUTO_INCREMENT,
        companyName VARCHAR(255) NOT NULL UNIQUE,
        createdAt DATE NOT NULL,
        managerEmail VARCHAR(255) NULL,
        studentRollNo VARCHAR(255) NULL,
        PRIMARY KEY (id)
    );`, (err, result) => {
        if (err) {
            console.log("[ERROR]: Failed to create companyData table");
            console.log(err);
        } else {
            console.log("[MESSAGE]: Created companyData table");
        }
    });

    db.query(`CREATE TABLE placementData (
        id INT NOT NULL AUTO_INCREMENT,
        studentId INT NOT NULL,
        companyId INT NOT NULL,
        ctc FLOAT NOT NULL,
        jobRole VARCHAR(255) NOT NULL,
        placementDate VARCHAR(108) NOT NULL,
        isIntern VARCHAR(1) NOT NULL,
        isPPO VARCHAR(1) NOT NULL,
        isOnCampus VARCHAR(1) NOT NULL,
        extraData VARCHAR(1000),
        createdAt VARCHAR(108) NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (studentId) REFERENCES studentData(id),
        FOREIGN KEY (companyId) REFERENCES companyData(id)
    );`, (err, result) => {
        if (err) {
            console.log("[ERROR]: Failed to create placementData table");
            console.log(err);
        } else {
            console.log("[MESSAGE]: Created placementData table");
        }
    });
}

module.exports = createTables;