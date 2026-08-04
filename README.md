# Confirmation Test System

The Confirmation Test System helps production operators complete and submit machine checks in one place. It also gives authorized supervisors and administrators a clear view of the latest values, proof images, machine conditions, historical records, and trends.

## Who Should Use This System

- Production operators responsible for routine machine confirmation checks
- Shift leaders and supervisors reviewing submitted values
- Engineering and digital-team administrators configuring machines and fields
- Authorized personnel reviewing records, proof images, and trends

## Main Features

- Face login and operator profile registration
- Password-protected Temporary User and Admin access
- Savoury and Dressings area selection
- Configurable confirmation fields for each machine
- Previous submitted values automatically prefilled
- New proof-image capture for every image field
- One submission for all configured machines in the selected area
- Latest-value view for each machine
- Machine summaries with mapped values and warning indicators
- Operator and machine trend comparisons
- Searchable and filterable submission records
- Admin machine, category, variable, and account management
- PostgreSQL storage for submissions, proof images, and website sessions
- Responsive layouts for computers, tablets, and mobile devices

## System Pages

| Page | Purpose | Access |
| --- | --- | --- |
| **Submit** | Complete the configured checks for every machine in the selected area and submit them together. | Operators and Admins |
| **Machines** | View the latest machine values, machine image, mapped parameters, and warning indicators. | Operators and Admins |
| **Trends** | Compare numeric values by operator or by machine using area, category, and parameter filters. | Operators and Admins |
| **System** | Add or edit machines, categories, images, confirmation fields, limits, and mapped callouts. | Admin only |
| **Register** | Register operator profiles and manage registered people. | Admin only |
| **Logs** | Search, filter, and review submitted confirmation records and available proof images. | Admin only |

## How to Use the System

### 1. Sign In

Open the system and choose the appropriate sign-in method:

- **Login** uses the camera to recognize a registered operator.
- **Register** creates a new operator profile and face-login link.
- **Temporary User** provides operator access using the authorized temporary-access password.
- **Admin** provides administrative access using the authorized temporary-access password.

Allow camera access when the browser requests it. Face login and face registration require the configured face-recognition service to be available.

### 2. Complete Machine Checks

Open **Submit**, then choose the correct area.

For every machine shown:

1. Review the prefilled values from the previous submission.
2. Confirm that each value is still correct or replace it with the current reading.
3. Complete every required field.
4. Capture a new proof image when an image field is provided.
5. Check that the machine is marked **Ready**.

The Ready counter shows how many machines can be submitted.

### 3. Submit the Checks

Select **Submit All** after every machine is ready.

The system validates the full list before saving. If a required value or proof image is missing, the affected machine is identified so it can be corrected. When the submission succeeds, the records are stored together and the Latest Value panel is updated.

### 4. Review Latest Machine Information

Open **Machines**, then select:

1. Area
2. Category
3. Machine

The page displays the latest submitted values and the configured machine image. Mapped callouts show the values at their assigned locations, and configured limits may produce warning indicators. Select **Refresh** to load newly submitted information.

### 5. Review Trends

Open **Trends** and select either:

- **Operator** to review an operator's values for a selected parameter.
- **Machine** to compare selected machines by area, category, and parameter.

Use the machine cards to add or remove machines from the comparison, then select **Refresh** when updated data is needed.

### 6. Review Submission Records

Admins can open **Logs** to search and filter submitted confirmation records. Available proof images may be opened from their related values.

### 7. Configure the System

Admins can use **System** to:

- Add, edit, or delete machines
- Assign an area and category
- Upload a machine image
- Add text, number, option, remarks, or image fields
- Mark fields as required
- Configure minimum and maximum limits
- Place value cards and points on the machine image

Changes should be reviewed carefully because they affect the fields shown to operators.

### 8. Manage Registered People

Admins can use **Register** to add operator profiles and remove profiles that are no longer required.

### 9. Sign Out

Select **Logout** after using the system, especially on a shared computer.

## Important Rules

- Previous non-image values are prefilled only as a starting point. Operators must confirm that they are still correct.
- Proof photos never carry over from a previous submission. A new proof image must be captured when required.
- All required machines and fields must be ready before **Submit All** can save the records.
- A value detected from an image should be checked by the operator before submission.
- Only Admin users can access System, Register, and Logs.
- Machine configuration changes affect future operator submissions.
- The system uses Manila time when displaying and filtering application records.
- The PostgreSQL database itself must already exist and be reachable before the application can become ready.

## Reminders and Useful Facts

- If a configured machine does not appear, confirm that it is active and assigned to the selected area and category.
- Newly submitted information may require **Refresh** before it appears on Machines, Trends, or Logs.
- Face login requires the browser camera permission and the face-recognition service.
- Automatic reading from proof images requires the configured image-reading service.
- The system stores proof images in PostgreSQL with their related confirmation records.
- Website visits are stored in `app."Confirmation-logs"` as one row per browser session. Page changes and normal actions do not create additional rows.
- A session's start time remains unchanged while its last-seen time is updated during the same browser session.
- The application automatically creates or updates its required tables inside the existing PostgreSQL database. Keep `schema.sql` and `confirmationproof.sql` in the project folder.

## Running the System with Docker

This section is for the person responsible for starting the system computer.

### Requirements

- Docker Desktop
- The complete project folder, including `docker-compose.yml`
- Access to the PostgreSQL database used by the application
- A configured `.env` file
- Access to the face-recognition and image-reading services when those features are required

The PostgreSQL database must already exist. The application creates or updates the required tables in the `app` schema when it starts.

### Configure `.env`

Create `.env` in the main project folder and enter the deployment values provided by the system owner:

```env
PUBLIC_PORT=your_app_port

USAGE_LOG_ENABLED=true

PGHOST=your_database_host
PGPORT=your_database_port
PGDATABASE=your_database_name
PGUSER=your_database_user
PGPASSWORD=your_database_password
PGSSL=false
PGCONNECT_TIMEOUT_MS=10000
SCHEMA_RETRY_MS=30000

TEMP_ACCESS_PASSWORD=your_temporary_access_password

AI_FACE_BASE_URL=http://your_face_ai_server
AI_FACE_REGISTER_PATH=/register
AI_FACE_SEARCH_PATH=/search
AI_FACE_TIMEOUT_MS=30000
AI_FACE_MODEL_NAME=SFace
AI_FACE_DETECTOR_BACKEND=yunet
AI_FACE_ALIGN=true
AI_FACE_L2_NORMALIZE=true
AI_FACE_DISTANCE_METRIC=cosine
AI_FACE_SEARCH_METHOD=exact

AI_IMAGE_BASE_URL=http://your_image_ai_server
AI_IMAGE_PATH=/api/generate
AI_IMAGE_MODEL=your_image_model
AI_IMAGE_TIMEOUT_MS=60000
MAX_PROOF_IMAGE_BYTES=6291456
```

Use the actual database, password, port, and AI-service values supplied for the deployment.

### Start the Application

Open PowerShell or Command Prompt in the project folder, then run:

```powershell
docker compose up -d --build
```

### Open the System

On the computer running Docker:

```text
http://localhost:your_app_port
```

From another computer on the same network:

```text
http://SERVER_IP:your_app_port
```

Replace `SERVER_IP` with the IP address of the computer running Docker and `your_app_port` with the value of `PUBLIC_PORT` in `.env`.

### Check the Application

```powershell
docker compose ps
```

Both `confirmation-app` and `confirmation-nginx` should show as running or healthy.

You may also check the public health endpoints:

```powershell
curl.exe http://localhost:your_app_port/health
curl.exe http://localhost:your_app_port/ready
```

### Restart the Application

Use this after changing `.env` or replacing application files:

```powershell
docker compose down --remove-orphans
docker compose up -d --build --force-recreate
docker compose ps
```

### Stop the Application

```powershell
docker compose down
```

Do not use `docker compose down -v`.

## Basic Troubleshooting

### The System Does Not Open

Check whether both containers are running:

```powershell
docker compose ps
```

View the latest messages:

```powershell
docker compose logs --tail=100
```

### `confirmation-app` Is Unhealthy

View the application messages:

```powershell
docker compose logs confirmation --tail=100
```

Confirm that the PostgreSQL connection values in `.env` are correct and that the database computer is reachable.

### The Port Is Already Allocated

Change `PUBLIC_PORT` in `.env` to an unused port, then recreate the containers:

```powershell
docker compose down --remove-orphans
docker compose up -d --force-recreate
```

### Face Login Does Not Work

- Allow camera access in the browser.
- Confirm that the person has been registered.
- Confirm that `AI_FACE_BASE_URL` points to the correct running service.
- Try Temporary User or Admin access if authorized access is urgently required.

### Proof-Image Reading Does Not Work

- Confirm that `AI_IMAGE_BASE_URL` points to the correct running service.
- Confirm that the configured image model is available.
- Retake a clear image with the value visible.
- Check the detected value before submitting.

### No Machines Appear

Ask an Admin to confirm that the machines are active and assigned to the selected area and category in System.

### Database Connection Error

Contact the system owner or database administrator to verify the PostgreSQL values in `.env` and confirm that the database is reachable.

## Security

- Share the Temporary User and Admin password only with authorized personnel.
- Keep `.env` and database credentials private.
- Do not expose PostgreSQL or the AI services directly to untrusted networks.
- Restrict Admin access to personnel authorized to change machine configurations or accounts.
- Sign out when the system is no longer being used.
