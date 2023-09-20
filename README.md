# Betteride Main Server
Betteride is a ride-hailing app that matches users with automated electric vehicles. This project is the main server for the Betteride app, and is responsible for calculating the distances between every user and every vehicle, and then rematching users and vehicles to ensure the best possible matches.<br>
The server is a stand-alone server and acts as a micro service for calculating the algorithm only. This means that it is independent of the other components of the Betteride app, and can be scaled independently.

# Algorithm
The server uses the Hungarian algorithm, which is a combinatorial optimization algorithm that solves the assignment problem. The assignment problem is the problem of finding the best way to assign a set of tasks to a set of agents, given that each agent has a different cost for completing each task.<br>
The Hungarian algorithm works by creating a cost matrix, where each row represents a user and each column represents a vehicle. The cost matrix contains the distance between each user and each vehicle. The algorithm then uses a process of elimination to find the best possible matches between users and vehicles.<br>
The Betteride server uses the Hungarian algorithm to ensure that users are matched with the closest automated electric vehicles. This helps to reduce the time that users have to wait for a ride.<br>
