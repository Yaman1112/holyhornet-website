"""Build supabase/seed.sql and assets/courses.json from the course outlines below.

run from the site folder: python tools/build_courses.py
The seed only adds what is missing, so running it again never overwrites edits made on the admin page.
"""
import json, uuid

NS = uuid.UUID("7d3b6a52-3a55-4b43-9b7c-2f0f3a7c1e11")

COURSES = [
 dict(id="uav-engineering", title="UAV Engineering & Design", category="Engineering", level="Foundation → intermediate",
  summary="How multirotors are designed and built, from airframes and propulsion to flight control, tuning and component selection.",
  modules=[
   ("Airframes", ["Central plate and arms", "Power distribution board", "Payload and lift capacity", "Monocoque frames", "Landing gear and retractable gear"]),
   ("Flight control and sensors", ["The flight controller", "Accelerometers and gyroscopes", "Barometer", "Magnetometer (compass)", "GNSS and GPS", "Power module: current and voltage sensing", "Distance sensors", "Optical flow", "Airspeed sensor", "Flight modes", "Data logging", "Vibration"]),
   ("PID tuning", ["The proportional term", "The integral term", "The derivative term", "A reliable PID tuning process", "Automatic PID tuning"]),
   ("Ground station and telemetry", ["The ground station", "Telemetry", "Ground station software", "Tracking antennas"]),
   ("Radio control", ["Radio control basics", "RC transmitters", "Receivers", "Antenna types", "Why 2.4 GHz?", "PWM and PPM"]),
   ("Motors and ESCs", ["Inrunner and outrunner motors", "Motor size", "Motor KV", "Motor configuration", "Choosing an ESC", "BEC: battery eliminating circuit", "Removing the ESC power wire", "Multirotor ESC firmware", "Common ESC settings", "Start-up acceleration", "Calibration with flight controller software"]),
   ("Propellers and the physics of flight", ["The physics behind flying", "Propeller materials", "Diameter and rotational speed", "Mounting propellers", "Balancing propellers"]),
   ("Batteries", ["What the numbers mean", "Battery connectors", "LiPo maintenance and safety", "Storing LiPo batteries", "Charging LiPo batteries"]),
   ("Cameras and FPV", ["Gimbals and cameras", "FPV transmitters", "Channel frequencies", "Transmitter power", "Matching transmitter and receiver", "Flying with others", "Switching bands and channels", "FPV receivers", "On-screen display", "FPV antennas"]),
   ("Designing your multirotor", ["Choosing components", "Thrust data tables", "Estimating flight time", "Pixhawk start-up guide"]),
  ]),
 dict(id="aerial-imaging", title="Aerial Photography & Cinematography", category="Imaging & data", level="All levels",
  summary="From exposure and camera settings to shooting, editing, 3D mapping and selling your aerial work.",
  modules=[
   ("Camera, lenses and filters", ["Exposure", "Shutter speed, aperture and ISO compared", "ND filters"]),
   ("Drone settings", ["Manufacturer training resources", "The app interface", "Aircraft status", "Intelligent flight modes", "General settings"]),
   ("Aerial photography", ["Camera settings for stills", "Panoramas", "Time-lapse"]),
   ("Photo post-production", ["The workspace", "The catalogue", "Importing", "Selecting", "Developing", "Exporting", "Panoramas in post", "Time-lapse in post"]),
   ("Filming with multirotors", ["Camera settings for video", "Intelligent flight modes for filming"]),
   ("Video post-production", ["Cameras and file formats", "Working with codecs", "Log, colour profiles and LUTs", "Compression", "Importing footage", "Proxy files", "Transcoding", "Editing"]),
   ("Selling your work", ["Publishing your work", "Pricing"]),
   ("Archiving", ["Backing up", "Folder structure", "File names", "Metadata", "Keywords", "Selling from your archive"]),
   ("Public space and privacy", ["Capturing footage", "Publishing footage", "Portrait rights", "Further points of attention"]),
   ("Cinematic technique: the shot", ["Framing from wide to close-up", "Camera position", "Point of view", "Composition", "Camera movement"]),
   ("Cinematic technique: planning a film", ["Basic principles", "Storyline", "Equipment"]),
   ("3D mapping", ["3D mapping software", "Other methods", "Applications"]),
  ]),
 dict(id="rpa-l-theory", title="Remote Pilot Licence (RPA-L) Theory", category="Piloting & regulation", level="Foundation",
  summary="The theory behind the remote pilot licence: law, airspace, principles of flight, technology, weather, navigation and operations.",
  modules=[
   ("Regulations, certificates and licences", ["General regulations and agencies", "Air traffic rules", "Airspace classification", "Aeronautical Information Service", "Air traffic services", "Aerodromes", "NOTAMs", "Time of day, day and night operations", "Nature reserves", "Operations near people and objects", "Required documents", "Accidents and incidents", "Certificates and licences", "UA registration and certificates", "Operator's licence: ROC and ROC-Light", "Insurance", "RPA-L requirements, logbook and renewal", "Medical certificate"]),
   ("Principles of flight", ["Laws of motion", "The four forces of flight", "The axes of flight", "Basic controls of an airplane", "Basic controls of a multirotor", "Basic controls of a helicopter", "Specific dangers for fixed wing", "Specific dangers for rotorcraft"]),
   ("UA technology", ["Fixed-wing, multirotor and helicopter parts", "Radio control gear", "Radio frequencies", "Power plant", "Electrical systems", "Sensors", "Battery technology", "Firmware, software and updates"]),
   ("Flight performance", ["Operational envelope", "Mass and balance", "Load factor", "Ground effect", "Autorotation", "Gliding without power"]),
   ("Meteorology", ["The atmosphere and the ISA", "Temperature", "Atmospheric pressure", "Wind", "Clouds", "Visibility", "Humidity, mist and fog", "Icing", "Sunrise and sunset", "Weather information", "METAR", "TAF"]),
   ("Navigation", ["The earth, great circles and small circles", "Latitude and longitude", "Direction, heading and track", "Distance and speed", "Land and aeronautical charts", "Positioning and GNSS", "Position errors and augmentation", "Inertial navigation", "Jamming and spoofing"]),
   ("Human factors", ["Health, medicines and alcohol", "Vision", "Stress", "Tiredness", "IMSAFE", "Airmanship", "Situational awareness"]),
   ("UA operations and planning", ["Duties of the operator and pilot", "Flight preparation", "NOTAMs, weather and Kp index", "Security and privacy", "VLOS and EVLOS operations", "Safety management and risk assessment", "Checklists", "Flying the operation", "Communication", "Special and emergency procedures", "Maintenance"]),
   ("Templates and logs", ["Glossary and ICAO phonetic alphabet", "Flight, battery and pilot logs", "Incident and maintenance logs", "Arrival, embarkation and flight checklists", "On-site survey", "Operational flight plan", "Risk assessment template"]),
  ]),
 dict(id="specific-category", title="Specific Category UAV Operations", category="Piloting & regulation", level="Experience dependent",
  summary="Planning and flying operations in the EU specific category: airspace, SORA risk assessment, mitigations and standard scenarios.",
  modules=[
   ("Aviation regulations and airspace", ["The specific category", "UAS classes", "Pilots and operators: responsibilities", "Airspace classification", "Aeronautical Information Service", "Air traffic services", "Aerodromes", "NOTAMs", "Daytime and night-time operations"]),
   ("Human factors", ["Vision", "Stress", "Airmanship", "Situational awareness"]),
   ("Operations and planning", ["Flight preparation", "Airspace and operational volume", "Briefing and site assessment", "NOTAMs, weather and Kp index", "SORA: concept of operations", "SORA: the ground risk process", "SORA: the air risk process", "SORA: SAIL and operational safety objectives", "Loss of the radio link", "Propulsion and power failure"]),
   ("Mitigations for ground risk", ["VLOS", "Flight modes", "Speed", "Controlled ground area", "STS-01", "STS-02"]),
   ("UA technology", ["Radio attenuation and frequencies", "Power plant", "Electrical systems", "Sensors", "Battery technology", "Firmware, software and updates"]),
   ("Meteorology", ["Wind", "Temperature and icing", "Visibility", "Humidity, mist and fog", "Atmospheric pressure", "Weather information", "How weather affects drones"]),
   ("Flight performance", ["Operational envelope", "Mass and balance", "Ground effect", "Autorotation", "Gliding without power"]),
   ("Mitigations for air risk", ["Technical mitigations", "Operational mitigations"]),
   ("Templates and logs", ["List of abbreviations", "Embarkation and arrival checklists", "Pre- and post-flight checklist", "Flight plan for STS", "Battery, incident and maintenance logs", "UAS and remote pilot flight logs"]),
  ]),
 dict(id="systems-engineering", title="UAV Systems Engineering", category="Engineering", level="Intermediate → advanced",
  summary="Model, simulate and control UAVs in MATLAB and Simulink, from PID to model predictive control, reinforcement learning, SLAM and swarms.",
  modules=[
   ("Modelling and simulation", ["Quadcopter dynamics in 1D, 2D and 3D", "Autonomous quadrotor in Simulink", "Trajectory and flight animation"]),
   ("Classical control", ["PD control", "PID control", "PID in Simulink"]),
   ("Optimal control", ["LQR for a quadcopter", "LQR in Simulink"]),
   ("Nonlinear control", ["Backstepping control", "Feedback linearization", "Sliding mode control"]),
   ("Model predictive control", ["MPC for a quadcopter", "MPC with feedback linearization", "Nonlinear MPC"]),
   ("Intelligent control", ["Fuzzy logic control", "Adaptive nonlinear control with fuzzy logic", "Q-learning control", "Deep reinforcement learning control"]),
   ("Trajectories, planning and estimation", ["Trajectory planning", "Trajectory tracking in Simulink", "RRT path planning", "3D SLAM with an extended Kalman filter"]),
   ("Beyond the quadcopter", ["Hexacopter delivery drone", "Octocopter simulation"]),
   ("Swarms and multi-UAV systems", ["Quadcopter swarms", "Vector field swarm guidance", "Multi-UAV planning with grey wolf optimisation"]),
   ("Applied project", ["Wind turbine inspection with a drone"]),
  ]),
 dict(id="ppl-theory", title="Private Pilot Licence PPL(A) Theory", category="Piloting & regulation", level="Foundation",
  summary="The theory behind the private pilot licence for aeroplanes: principles of flight, aircraft and instruments, air law, radio, weather, human performance, navigation, performance and procedures.",
  modules=[
   ("Principles of flight", ["How a wing produces lift", "Drag", "The four forces, lift/drag ratio and ground effect", "Axes of motion and stability", "Load factor and manoeuvring speed", "Primary flight controls", "Flight control systems, secondary controls and autopilot", "Turns, climbs and descents", "What happens in a stall", "Types of stall", "Power-on stalls", "Stall recovery", "Spins", "Spiral dives and how they differ from spins", "Flaps and take-off and landing technique"]),
   ("Aircraft general knowledge", ["Aircraft components and construction", "The piston engine", "The ignition system", "The carburettor and carburettor icing", "The fuel system and fuel injection", "The electrical system", "Flight instruments and the pitot-static system", "The airspeed indicator and types of airspeed", "Airspeed indicator markings and pitot-static blockages", "The International Standard Atmosphere", "The barometric altimeter", "Altimeter settings, flight levels and the transition layer", "Types of altitude", "Altitude abbreviations", "The vertical speed indicator", "The magnetic compass", "Variation and deviation", "Compass acceleration and turning errors", "Gyroscopes", "The attitude indicator", "The heading indicator", "The turn indicator and turn coordinator", "Measuring air temperature", "Angle of attack indicators", "The radio altimeter", "The remote indicating compass", "Mach number and the Machmeter", "Air data computers", "AHRS and digital instruments", "Inertial navigation systems", "Propeller basics", "Constant-speed propellers", "Propeller effects"]),
   ("Air law", ["ICAO and the international conventions", "VFR and IFR flight", "Right-of-way rules", "Aircraft lights", "The traffic pattern", "Runway markings", "Airport signs", "Aerodrome visual signals", "Runway numbers and letters", "Flying in the Czech Republic: authorities, documents and altimeter procedures", "Airspace classification", "Flight plans", "Czech VFR rules and the VFR Manual", "Aerodromes and SLZ fields"]),
   ("Communication", ["Communication basics", "Radio calls at an uncontrolled aerodrome", "Radio calls at a controlled aerodrome", "Standard phraseology"]),
   ("Meteorology", ["The atmosphere, pressure and wind", "Stability, moisture and clouds", "Air masses, fronts and precipitation", "Heating, thermals and local winds", "Thunderstorms", "Turbulence", "Weather information in flight and ATIS", "METAR", "TAF"]),
   ("Human performance and limitations", ["Altitude, breathing and the body", "Heat, stress, fatigue and motion sickness", "Vision, illusions, alcohol and drugs"]),
   ("Navigation", ["Methods of air navigation", "The Earth and geographic coordinates", "Distance from coordinates", "Time: solar time, time zones and UTC", "Direction, true course and magnetic course", "Wind, heading and compass heading", "Great circles and rhumb lines", "Map projections and scale", "VFR charts and their symbols", "The flight computer: calculator side", "The flight computer: wind side", "The wind triangle", "The VFR navigation log", "Choosing a VFR route", "Radio navigation aids: NDB and VOR", "Using the VOR", "How GPS works", "Navigation calculations for the exam"]),
   ("Flight performance and planning", ["Pre-flight information: AIP, NOTAMs and circulars", "Mass and balance", "Take-off and landing performance", "Fuel planning", "Estimating crosswind: the clock method", "Performance and fuel calculations for the exam", "Reading a flight manual: the Cessna 150"]),
   ("Operational procedures", ["Wind shear and microbursts", "Wingtip vortices and wake turbulence"]),
  ]),
]

def q(s): return "'" + s.replace("'", "''") + "'"

sql = ["-- Generated by tools/build_courses.py: course outlines with no prices and no lesson content yet.",
       "-- Safe to run again: it only adds what is missing.", ""]
data = []
for cp, c in enumerate(COURSES, 1):
    sql.append(f"insert into public.courses (id, title, summary, category, level, position, published) values "
               f"({q(c['id'])}, {q(c['title'])}, {q(c['summary'])}, {q(c['category'])}, {q(c['level'])}, {cp}, true) on conflict (id) do nothing;")
    mods = []
    for mp, (mt, lessons) in enumerate(c["modules"], 1):
        mid = uuid.uuid5(NS, f"{c['id']}/{mp}")
        sql.append(f"insert into public.modules (id, course_id, title, position) values ('{mid}', {q(c['id'])}, {q(mt)}, {mp}) on conflict (id) do nothing;")
        ls = []
        for lp, lt in enumerate(lessons, 1):
            lid = uuid.uuid5(NS, f"{c['id']}/{mp}/{lp}")
            sql.append(f"insert into public.lessons (id, module_id, title, position) values ('{lid}', '{mid}', {q(lt)}, {lp}) on conflict (id) do nothing;")
            ls.append({"id": str(lid), "title": lt, "position": lp, "duration_min": None, "is_preview": False})
        mods.append({"id": str(mid), "title": mt, "position": mp, "lessons": ls})
    sql.append("")
    data.append({k: c[k] for k in ("id", "title", "summary", "category", "level")} | {"description": "", "price_cents": None, "currency": "eur", "modules": mods})

open("supabase/seed.sql", "w", encoding="utf-8", newline="\n").write("\n".join(sql))
json.dump(data, open("assets/courses.json", "w", encoding="utf-8", newline="\n"), ensure_ascii=False, separators=(",", ":"))
for d in data:
    print(d["id"], len(d["modules"]), "modules", sum(len(m["lessons"]) for m in d["modules"]), "lessons")
