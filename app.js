const express = require("express");
const hbs = require("hbs");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const mysql = require("mysql2");
const MySQLStore = require('express-mysql-session')(session);

var app = express();
const urlencodedParser = bodyParser.urlencoded({extended: false});
app.use(bodyParser.json());
app.use(cookieParser());

app.use(express.static(__dirname + "/public"));

var options = {
    connectionLimit: 5,
    host: "127.0.0.1",
    user: "root",
    database: "employeedb"
}

const pool = mysql.createPool(options); //соединение с базой данных
    
var sessionStore = new MySQLStore(options); /* session store options */

app.use(
    session({
        store: sessionStore,
        resave: true,
        saveUninitialized: false,
        secret: "superSecret"
    })
); 

app.set("view engine", "hbs");
hbs.registerPartials(__dirname + "/views/partials");

/****************************************************РЕГИСТРАЦИЯ ПОЛЬЗОВАТЕЛЕЙ********************************************************/
//Открытие страницы авторизации
app.get("/", function(request, response) {
    if(request.session.userLogin) {
        console.log("Есть куки файлы");
        console.log(`\tin login if true: `, request.session.userLogin)
        console.log(`\trequest.headers['cookie']: `, request.headers['cookie']);
        response.redirect("/index");
    }
    else {
        console.log("Нет куки файлов");
        console.log(`\tin login if false: `, request.session.userLogin)
        console.log(`\trequest.headers['cookie']: `, request.headers['cookie']);
        response.render("users_sign_in.hbs");
    }
});

app.post("/", function(request, response) {
    if(!request.body.username || !request.body.password) 
        return response.json({message: "Заполните все поля"});

    console.log("\tавторизация: ");

    let username = request.body.username;
    let password = request.body.password;

    pool.query(`SELECT * from users_login WHERE login = '${username}'`, function(err1, data) {
        if(data[0]) {
            if(data[0]['password'] == password){
                    request.session.userId = data[0]['id'];
                    request.session.userLogin = data[0]['login'];
                    request.session.userRole = data[0]['role'];
                    console.log(request.session);
                    
                    if(request.session.userRole == 0) {
                        response.json({
                            field: 0,
                            message: ""
                        });
                    } else {
                        response.json({
                            field: 2,
                            message: "Нет разрешённого доступа!"
                        });
                    }
            }    
                else {
                    response.json({
                        field: 2,
                        message: "Неверный пароль"
                    });
                }
           
        } 
        else {
            response.json({
                field: 1,
                message: "Неверный логин"
            });
        }
    });
});

//Открытие страницы регистрации       
app.get("/login", function(request, response) {
    response.render("users_login.hbs");
});

app.post("/login", function(request, response) {
    if(!request.body.username || !request.body.password) 
        return response.json({message: "Заполните все поля"});
    console.log("регистрация: ");
    console.log(request.cookies);
    console.log(request.body);

    let username = request.body.username;
    let password = request.body.password;
    if(username.length < 5 || username.length > 16) {
        console.log("Введите количество символов больше 4 и меньше 16");
        response.json({
            field: 1,
            message: "Введите количество символов больше 4 и меньше 16"
        });
    } else if(password.length < 5 || password.length > 16) {
        console.log("Введите длину пароля больше 4 символов и меньше 16");
        response.json({
            field: 2,
            message: "Введите длину пароля больше 4 символов и меньше 16"
        });
    } else {
        pool.query(`SELECT * from users_login WHERE login = '${username}'`, function(err, data1) {
            if(data1[0]) {
                console.log(data1[0]);

                if(data1[0]['login']) {
                    console.log("Такой логин уже есть. Введите другой логин");
                    response.json({
                        field: 1,
                        message: "Пользователь с таким логином уже зарегистрирован. Введите другой логин"
                    });
                } 
            } 
            else {
                pool.query("INSERT INTO users_login(login, password, role) VALUES(?,?,?)", [username, password, 0], 
                function(err, data2) {
                    console.log(data2);
                    if(err) {
                        response.json({
                        field: 1,
                        message: "Произошла ошибка. Введите данные повторно"
                        });
                    }
                    request.session.userId = data2['insertId'];
                    request.session.userLogin = username;
                    request.session.userRole = 0;
                    console.log(request.session);
                    response.json({
                        field: 0,
                        message: "Вы успешно зарегистрированы!"
                    });
                }); 
            } 
        });
    }
});


app.get("/logout", function(request, response){
    if(request.session) {
        console.log("\t\tlogout");
        request.session.destroy(function(){
            request.headers['cookie'] = "";
            request.cookies = "";
            response.redirect("/");
        });
    }
    else {
        response.redirect("/");
    }
});
/*********************************************************ГЛАВНАЯ СТРАНИЦА**********************************************************/
function correct_date(uncorrect_date) {  //Форматирует дату в виде: "дд-мм-гггг" в вид: "гггг-мм-дд"
    let d = uncorrect_date.slice(0, 2);
    let m = uncorrect_date.slice(3, 5);
    let y = uncorrect_date.slice(6, 10);
    return `${y}-${m}-${d}`;
}

//Открытие главной страницы
var global_Date = 0;  //Дата, выбранная в календаре
const monthNames = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'];
const colorNames = ['#acd6f5', '#81ff51', '#f56f37', '#f53931', '#acabac'];

app.get("/index", function(request, response){
    if(request.session.userRole == 0 && request.session.userLogin) {
        if(global_Date)
            var date = new Date(global_Date);
        else var date = new Date();
        let y = date.getFullYear();
        let m = date.getMonth() + 1;
        let d = date.getDate();
        let hh = new Date().getHours();
        let mm = new Date().getUTCMinutes();
        let curDate = `${y}-${m}-${d}`;
        let curTime = `${hh}:${mm}`;
        let formatDate = `${d} ${monthNames[m-1]} ${y}`;

        //console.log(new Date(global_Date));
        //console.log(curDate);
        //console.log(curTime);
        let data = {};
        pool.query("SELECT id, employee from employees WHERE terminationDay is NULL", function(err, data1) {
            if(err)
                return console.log(err);
            //console.log("data1: ");
            //console.log(data1);
            data = data1;
            pool.query(`SELECT id, timeOfArrival, numberOfHours, employeeId, isExcused, comment from timeSheet ` +
                `where currentDay = '${curDate}'`, function(err, data2) {
                if(err)
                    return console.log(err);
                //console.log("data2: ");
                //console.log(data2);
                for (let i = 0; i<data2.length; i++) {
                    for (let j=0; j<data.length; j++) {
                        if(data2[i]['employeeId'] == data[j]['id']) {
                            data[j]['timeOfArrival'] = data2[i]['timeOfArrival'];
                            data[j]['numberOfHours'] = data2[i]['numberOfHours'];
                            data[j]['employeeId'] = data2[i]['employeeId'];
                            data[j]['timesheetId'] = data2[i]['id'];
                            data[j]['comment'] = data2[i]['comment'];
                        }
                    }
                }
                for (let j=0; j<data.length; j++) {
                    data[j]['color'] = colorNames[0];           //по умолчанию строка подсвечивается в голубой цвет
                }
                for (let i = 0; i<data2.length; i++) {
                    for (let j=0; j<data.length; j++) {
                        if(data2[i]['isExcused'] && data2[i]['employeeId'] == data[j]['id']){       //Если сотрудник отпросился,
                            data[j]['color'] = colorNames[4];   //закрасить его строку в серый цвет
                        }
                    }
                }
                pool.query(`SELECT * from holidays WHERE '${curDate}' BETWEEN date_from and date_to`, function(err, data3) {
                    if(err)
                        return console.log(err);
                    //console.log("data3: ");
                    //console.log(data3);
                    for (let i = 0; i<data3.length; i++) {
                        for (let j=0; j<data.length; j++) {
                            if(data3[i]['employeeId'] == data[j]['id']) {           //Если сотрудник в отпуске, командировке, на больничном,
                                data[j]['color'] = colorNames[data3[i]['kindOfHolidayId']];  //закрасить его строку в соответсвующий цвет
                            }
                        }
                    }
                    pool.query(`SELECT * from meeting WHERE currentDay = '${curDate}' ` +
                        `and '${curTime}' BETWEEN timeFrom and timeTo`, function(err, data4) {
                        if(err)
                            return console.log(err);
                        for (let i = 0; i<data4.length; i++) {
                            for (let j=0; j<data.length; j++) {
                                if(data4[i]['timesheetId'] == data[j]['timesheetId']) {
                                    data[j]['color'] = colorNames[4];
                                }
                            }
                        }
                        //console.log("data4: ");
                        //console.log(data4);
                        //console.log(data);

                        pool.query(`SELECT * from meeting WHERE currentDay = '${curDate}'`, function(err, data5){
                            if(err)
                                return console.log(err);
                            for (let j=0; j<data.length; j++) {
                                data[j]['causeText'] = {};
                            }
                            for (let i = 0; i<data5.length; i++) {
                                for (let j=0; j<data.length; j++) {
                                    if(data5[i]['timesheetId'] == data[j]['timesheetId']) {
                                        data[j]['causeText']['next' + i] = data5[i]['causeText'];
                                    }
                                }
                            }
                            for (let i = 0; i<data.length-1; i++) { //сортировка сотрудников в алфавитном порядке
                                for (let j = i+1; j<data.length; j++) {
                                    if (data[i]['employee'] > data[j]['employee']) {
                                        var tmp = data[i];
                                        data[i] = data[j];
                                        data[j] = tmp;
                                    }
                                }
                            }
                            for (let i = 0; i<data.length; i++) {
                                data[i]['order'] = i+1;
                            }
                            //console.log(data5);
                            //console.log(data);
                            response.render("index.hbs", {
                                employees: data,
                                formatDate : formatDate
                            });
                        });
                    });
                });
            });
        });
    } 
    else {
        console.log("Вы не авторизованы!");
        response.redirect(301, "/");
    }
});

//Обработка запроса обновления даты
app.post("/index", function(request, response){
    if(!request.body)
        return response.sendStatus(400);
    global_Date = request.body.n_date;
    //console.log(global_Date);
});


//Обработка иконки и формы сохранить/редактировать
function getCorrectTime(time){
    let hh = time.slice(0, 2);
    let mm = time.slice(3, 5);
    let rez = hh*3600000 + mm*60000;
    return new Date(rez);
}
app.post('/save/:employeeId', urlencodedParser, function(request, response) {
    if(!request.body)
        return response.sendStatus(400);
    const timeOfArrival = request.body.timeOfArrival;
    let numberOfHours = "";
    if(request.body.numberOfHours && request.body.numberOfHours !== "00:00") {
        numberOfHours = request.body.numberOfHours;
    }
    else {
        let timeToLeave = "18:00";   //Конец рабочего дня по умолчанию
        let time_to_leave = getCorrectTime(timeToLeave); //Время ухода сотрудников
        let time_of_arrival = getCorrectTime(timeOfArrival);  //Время прихода сотрудников
        let number_of_hours = new Date(time_to_leave.getTime() - time_of_arrival.getTime());  //Разница между временем прихода и ухода
        numberOfHours = `${number_of_hours.getUTCHours() - 1}:${number_of_hours.getUTCMinutes()}`; //Количество отработанных часов

    }
    const employeeId = request.params.employeeId;

    if(global_Date)
        var date = new Date(global_Date);
    else var date = new Date();
    let y = date.getFullYear();
    let m = date.getMonth() + 1;
    let d = date.getDate();
    let curDate = `${y}-${m}-${d}`;   //Выбранная в календаре дата

    console.log("\n\tbegin");
    console.log(curDate);
    console.log(request.body);

    pool.query(`SELECT id, employeeId from timeSheet WHERE currentDay = '${curDate}' and employeeId = '${employeeId}'`, function(err, data) {
        if(err)
            return console.log(err);
        console.log(data[0]);
        if(data[0]) {
            console.log("\tupdate timesheet: ");
            let global_id = parseInt(data[0]['id']);
            console.log("global_id: " + global_id);
            pool.query("UPDATE timeSheet SET currentDay=?, timeOfArrival=?, numberOfHours=?, employeeId=? " +
                "WHERE id=?", [curDate, timeOfArrival, numberOfHours, employeeId, global_id], function(err, data){
                if(err)
                    return console.log(err);
                response.redirect(301, "/index");
            });
        }
        else {
            pool.query("INSERT INTO timeSheet(currentDay, timeOfArrival, numberOfHours, employeeId)" +
                "VALUES (?,?,?,?)", [curDate, timeOfArrival, numberOfHours, employeeId], function(err, data) {
                if(err)
                    return console.log(err);
                response.redirect(301, "/index");
            });
        }
    });
});

//Обработка кнопки и формы отпросился
app.post("/getAway/:employeeId", urlencodedParser, function(request, response){
    if(!request.body)
        return response.sendStatus(400);
    const causeText = request.body.getAwayComment;
    const employeeId = request.params.employeeId;

    if(global_Date)
        var date = new Date(global_Date);
    else var date = new Date();
    let y = date.getFullYear();
    let m = date.getMonth() + 1;
    let d = date.getDate();
    let curDate = `${y}-${m}-${d}`;

    console.log("\nbegin Отпросился: ");
    console.log(curDate);
    console.log(request.body);

    pool.query(`SELECT * from timeSheet WHERE currentDay = '${curDate}' and employeeId = '${employeeId}'`, function(err, data) {
        if(err)
            return console.log(err);
        console.log(data[0]);
        if(data[0]) {
            let timeSheet_id = parseInt(data[0]['id']);
            let timeOfArrival = data[0]['timeOfArrival'];
            let numberOfHours = data[0]['numberOfHours'];
            console.log("timeSheet_id: " + timeSheet_id);
            console.log("timeOfArrival: " + timeOfArrival);
            console.log("numberOfHours: " + numberOfHours);
            pool.query("UPDATE timeSheet SET currentDay=?, timeOfArrival=?, numberOfHours=?, employeeId=?, " +
                "isExcused=?, comment=? WHERE id=?",
                [curDate, timeOfArrival, numberOfHours, employeeId, true, causeText, timeSheet_id],
                function(err, data){
                    if(err)
                        return console.log(err);
                    response.redirect(301, "/index");
                });
        }
        else {
            pool.query("INSERT INTO timeSheet(currentDay, employeeId, isExcused, comment)" +
                "VALUES (?,?,?,?)", [curDate, employeeId, 1, causeText], function(err, data) {
                if(err)
                    return console.log(err);
                response.redirect(301, "/index");
            });
        }
    });
});

//Обработка кнопки и формы встречи
app.post("/meeting/:employeeId", urlencodedParser, function(request, response){
    if(!request.body)
        return response.sendStatus(400);
    console.log(request.body);
    const timeFrom = request.body.meeting_timeFrom;
    const timeTo = request.body.meeting_timeTo;
    var causeText = request.body.meetingComment;
    const employeeId = request.params.employeeId;

    if(global_Date)
        var date = new Date(global_Date);
    else var date = new Date();
    let y = date.getFullYear();
    let m = date.getMonth() + 1;
    let d = date.getDate();
    let curDate = `${y}-${m}-${d}`;

    pool.query(`SELECT id, employeeId from timeSheet WHERE currentDay = '${curDate}' and employeeId = '${employeeId}'`, function(err, data) {
        if(err)
            return console.log(err);
        console.log(data[0]);
        if(data[0]) {
            let timeSheet_id = parseInt(data[0]['id']);
            console.log("timeSheet_id: " + timeSheet_id);
            pool.query("INSERT INTO meeting(currentDay, timeFrom, timeTo, causeText, timesheetId) " +
                "VALUES (?,?,?,?,?)", [curDate, timeFrom, timeTo, causeText, timeSheet_id], function(err, data){
                if(err)
                    return console.log(err);
                response.redirect("/index");
            });
        }
        else {
            pool.query("INSERT INTO timeSheet(currentDay, employeeId)" +
                "VALUES (?,?)", [curDate, employeeId], function(err, data) {
                if(err)
                    return console.log(err);
                pool.query(`SELECT id, employeeId from timeSheet WHERE currentDay = '${curDate}' and employeeId = '${employeeId}'`, function(err, data) {
                    if (err)
                        return console.log(err);
                    let timeSheet_id = parseInt(data[0]['id']);
                    console.log("timeSheet_id: " + timeSheet_id);

                    pool.query("INSERT INTO meeting(currentDay, timeFrom, timeTo, causeText, timesheetId) " +
                        "VALUES (?,?,?,?,?)", [curDate, timeFrom, timeTo, causeText, timeSheet_id], function(err, data){
                        if(err)
                            return console.log(err);
                        response.redirect("/index");
                    });
                });
            });
        }
    });
});


/***************************************************СТРАНИЦА МОЙ ТАБЕЛЬ*************************************************************/
//Открытие страницы Мой табель
app.get("/my_report_card", function(request, response){
    if(request.session.userRole == 0 && request.session.userLogin) {
        response.render("my_report_card.hbs");
    } 
    else {
        console.log("Вы не авторизованы!");
        response.redirect(301, "/");
    }
});


/***************************************************СТРАНИЦА ВСЕ ТАБЕЛИ*************************************************************/
//Открытие страницы Все табели
app.get("/all_report_cards", function(request, response){
    if(request.session.userRole == 0 && request.session.userLogin) {
        response.render("all_report_cards.hbs");
    } 
    else {
        console.log("Вы не авторизованы!");
        response.redirect(301, "/");
    }
});


/***************************************************СТРАНИЦА СОТРУДНИКИ*************************************************************/
//Открытие страницы Сотрудники
app.get("/worker", urlencodedParser, function(request, response){
    if(request.session.userRole == 0 && request.session.userLogin) {
        pool.query("SELECT id, employee, DATE_FORMAT(birthDay, '%d.%m.%Y'), DATE_FORMAT(appointmentDay, '%d.%m.%Y'), " +
            "DATE_FORMAT(terminationDay, '%d.%m.%Y') from employees", function(err, data) {
            if(err)
                return console.log(err);
            //форматируем дату в формате %d.%m.%Y
            for(let i=0; i<data.length; i++) {
                data[i]['birthDay'] = data[i]["DATE_FORMAT(birthDay, \'%d.%m.%Y\')"];
                data[i]['appointmentDay'] = data[i]["DATE_FORMAT(appointmentDay, \'%d.%m.%Y\')"];
                data[i]['terminationDay'] = data[i]["DATE_FORMAT(terminationDay, \'%d.%m.%Y\')"];
                data[i]['isTerminationDay'] = false;
                if(data[i]['terminationDay']) {
                    data[i]['isTerminationDay'] = true;     //сотрудник уволен
                }
            }
            //console.log(data);
            response.render("worker.hbs", {
                employees: data
            });
        });
    } 
    else {
        console.log("Вы не авторизованы!");
        response.redirect(301, "/");
    }
});

//Обработка формы добавления сотрудника
app.post("/worker", urlencodedParser, function(request, response){
    if(!request.body)
        return response.sendStatus(400);
    console.log(request.body);
    const name = request.body.employeeName;
    const birthDay = correct_date(request.body.employeeBirthDay);
    const appointmentDay = correct_date(request.body.employeeAppoinmentDay);
    pool.query("INSERT INTO employees(employee, birthDay, appointmentDay) " +
        "VALUES (?,?,?)", [name, birthDay, appointmentDay], function(err, data){
        if(err)
            return console.log(err);
        response.redirect("/worker");
    });
});

//Обработка формы редактирования сотрудника
app.post("/worker/edit/:id", urlencodedParser, function(request, response){
    if(!request.body)
        return response.sendStatus(400);
    console.log(request.body);
    const id = request.params.id;
    const name = request.body.employeeName;
    const birthDay = correct_date(request.body.employeeBirthDay);
    const appointmentDay = correct_date(request.body.employeeAppoinmentDay);

    if(request.body.employeeTerminationDay) {
        const terminationDay = correct_date(request.body.employeeTerminationDay);
        console.log(terminationDay);

        pool.query("UPDATE employees SET employee=?, birthDay=?, appointmentDay=?, " +
            "terminationDay=? WHERE id=?", [name, birthDay, appointmentDay, terminationDay, id], function(err, data){
            if(err)
                return console.log(err);
            response.redirect("/worker");
        });
    }
    else {
        pool.query("UPDATE employees SET employee=?, birthDay=?, appointmentDay=? where id=?",
            [name, birthDay, appointmentDay, id], function(err, data){
            if(err)
                return console.log(err);
            response.redirect("/worker");
        });
    }
});


//Обработка кнопки и формы отпуска
app.post("/worker/holiday/:id", urlencodedParser, function(request, response){
    if(!request.body)
        return response.sendStatus(400);
    console.log(request.body);
    const id = parseInt(request.body.id);
    const dateOfHoliday = correct_date(request.body.dateOfHoliday);
    const dateOfEndHoliday = correct_date(request.body.dateOfEndHoliday);
    var causeText = request.body.causeText;
    const kindOfHolidayId = 1;

    pool.query("INSERT INTO holidays(date_from, date_to, causeText, kindOfHolidayId, employeeId) " +
        "VALUES (?,?,?,?,?)", [dateOfHoliday, dateOfEndHoliday, causeText, kindOfHolidayId, id], function(err, data){
        if(err)
            return console.log(err);
        response.redirect("/worker");
    });
});

//Обработка кнопки и формы командировки
app.post("/worker/businessTrip/:id", urlencodedParser, function(request, response){
    if(!request.body)
        return response.sendStatus(400);
    console.log(request.body);
    const id = parseInt(request.body.id);
    const dateFrom = correct_date(request.body.dateFrom);
    const dateTo = correct_date(request.body.dateTo);
    var causeText = request.body.causeText;
    const kindOfHolidayId = 2;

    pool.query("INSERT INTO holidays(date_from, date_to, causeText, kindOfHolidayId, employeeId) " +
        "VALUES (?,?,?,?,?)", [dateFrom, dateTo, causeText, kindOfHolidayId, id], function(err, data){
        if(err)
            return console.log(err);
        response.redirect("/worker");
    });
});

//Обработка кнопки и формы больничного
app.post("/worker/sickDays/:id", urlencodedParser, function(request, response){
    if(!request.body)
        return response.sendStatus(400);
    console.log(request.body);
    const id = parseInt(request.body.id);
    const dateFrom = correct_date(request.body.dateFrom);
    const dateTo = correct_date(request.body.dateTo);
    var causeText = request.body.causeText;
    const kindOfHolidayId = 3;

    pool.query("INSERT INTO holidays(date_from, date_to, causeText, kindOfHolidayId, employeeId) " +
        "VALUES (?,?,?,?,?)", [dateFrom, dateTo, causeText, kindOfHolidayId, id], function(err, data){
        if(err)
            return console.log(err);
        response.redirect("/worker");
    });
});



/*******************************************************СТРАНИЦА ОТЧЁТЫ**************************************************************/
//Открытие страницы Отчёты
app.get("/reports", function(request, response){
    if(request.session.userRole == 0 && request.session.userLogin) {
        response.render("reports.hbs");
    } 
    else {
        console.log("Вы не авторизованы!");
        response.redirect(301, "/");
    }
});


/****************************************************СТРАНИЦА ПОЛЬЗОВАТЕЛИ**************************************************************/
//Открытие страницы Пользователи


/****************************************************СТРАНИЦА ОБ УЧРЕЖДЕНИИ**********************************************************/
//Открытие страницы Об учреждении
app.get("/tuning/organization", function(request, response) {
    if(request.session.userRole == 0 && request.session.userLogin) {
        response.render("organization.hbs");
    } 
    else {
        console.log("Вы не авторизованы!");
        response.redirect(301, "/");
    }
});



//прослушивание сервера на порту 3000
var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log("Example app listening at http://%s:%s", host, port)

});