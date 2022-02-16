colorArray = ["red","black","blue","box","cyan","yellow"]

const createTempCar = async (position) => {
    tempCar = {
        "plateNumber": await fetch(`https://random-data-api.com/api/vehicle/random_vehicle`)
            .then(response => response.json())
            .then(response => response.license_plate),
        "battery": Math.floor(Math.random() * 100),
        "color": colorArray[Math.floor(Math.random() * colorArray.length)],
        "currentLocation": {
            "address": position.address,
            "location": position.location
        },
        "accessibility": {
            "windows": {
                "frontLeft": Math.floor(Math.random() * 100),
                "frontRight": Math.floor(Math.random() * 100),
                "backLeft": Math.floor(Math.random() * 100),
                "backRight": Math.floor(Math.random() * 100)
            },
            "ac": {
                "desiredTemp": Math.floor(Math.random() * 14) + 16,
                "currentTemp": Math.floor(Math.random() * 14) + 16,
                "mode": "cool",
                "direction": "foot"
            },
            "lights": {
                "frontSeats": Math.floor(Math.random() * 100),
                "backSeats": Math.floor(Math.random() * 100)
            }
        },
        "passenger": [],
    }
}
const addDestinationPosition = (button) => {
    console.log("trying to add destination")
    button.style.fontWeight = 'bold';
    button.style.backgroundColor = "rgb(115, 185, 255)";
    button.style.border = "2px solid rgb(0,0,0)";
    listener = google.maps.event.addListener(map, 'click', (event) => {
        geocoder.geocode({ 'latLng': event.latLng }, (results, status) => {
            if (status == google.maps.GeocoderStatus.OK) {
                if (results[0]) {
                    fetch(`http://localhost:3000/api/getRoute?fromLat=${tempCar.currentLocation.location.lat}
                            &fromLng=${tempCar.currentLocation.location.lng}
                            &toLat=${results[0].geometry.location.lat()}
                            &toLng=${results[0].geometry.location.lng()}`)
                        .then(response => response.json())
                        .then(response => {
                            tempCar.currentTrip = response.routes[0].legs[0];
                            uploadCar(tempCar);
                            tempCar = null;
                            marker.setMap(null);
                            button.style.fontWeight = 'normal';
                            button.style.backgroundColor = "rgb(255, 255, 255)";
                            button.style.border = "2px solid rgb(115, 185, 255)";
                    });
                    google.maps.event.removeListener(listener);
                    infowindow.close();
                }
            }
        });
    });
}
const minimizeWindow = (condition) => {
    if(condition) uploadCar(tempCar);
    infowindow.close();
    tempCar = null;
    marker.setMap(null);
}
const changeAddCarButton = (type) => {
    button = document.querySelector('#addCars');
    if (type == "save") {
        button.style.fontWeight = 'bold';
        button.innerText = "Save Car";
        button.style.backgroundColor = "rgb(115, 185, 255)";
        button.style.border = "2px solid rgb(0,0,0)";
    }
    else {
        button.style.fontWeight = 'normal';
        button.style.backgroundColor = "rgb(255, 255, 255)";
        button.style.border = "2px solid rgb(115, 185, 255)";
        button.innerText = "Add Car";
    }
}
