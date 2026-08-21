FUNCTION ZRFC_TRANSPORT_REQUEST_RELEASE.
*"----------------------------------------------------------------------
*" Release transport request (children first, then parent).
*" IV_MODE: TEST_RUN = check only, RELEASE = execute.
*" ET_RESULTS task: TRKORR|TRFUNCTION|AS4TEXT|STATUS|MESSAGE|SEQ
*" ET_RESULTS object:
*" OBJECT|TRKORR|PGMID|OBJECT|OBJ_NAME|STATUS|MESSAGE|SEQ
*" STATUS: PASS, WARNING, ERROR, RELEASED, SKIPPED
*" Warnings do not block a release; only errors do.
*"----------------------------------------------------------------------

  DATA: LV_TRFUNCTION TYPE E070-TRFUNCTION,
        LV_TRSTATUS   TYPE E070-TRSTATUS,
        LV_AS4TEXT    TYPE E07T-AS4TEXT,
        LV_AS4USER    TYPE E070-AS4USER,
        LV_STRKORR    TYPE E070-STRKORR,
        LT_CHILDREN   TYPE STANDARD TABLE OF E070,
        LS_CHILD      TYPE E070,
        LV_LINE       TYPE ABAPTXT255,
        LV_BUF        TYPE STRING,
        LV_SEQ        TYPE I,
        LV_SEQ_C(3)   TYPE C,
        LV_HAS_ERROR  TYPE C,
        LV_SUBRC      TYPE SY-SUBRC,
        LV_VERIFIED_STATUS TYPE E070-TRSTATUS,
        LV_RELEASE_ATTEMPTS TYPE I,
        LV_WAIT_COUNT TYPE I,
        LV_CHILD_TEXT TYPE E07T-AS4TEXT,
        LV_OBJ_CNT    TYPE I,
        LV_RC_C(2)    TYPE C,
        LT_OBJECTS    TYPE STANDARD TABLE OF E071,
        LS_OBJECT     TYPE E071,
        LS_REQUEST    TYPE TRWBO_REQUEST,
        LT_MESSAGES   TYPE CTSGERRMSGS,
        LS_MESSAGE    TYPE CTSGERRMSG,
        LT_OBJECT_MESSAGES TYPE CTSGERRMSGS,
        LT_FAILED_OBJECTS TYPE STANDARD TABLE OF E071,
        LS_FAILED_OBJECT TYPE E071,
        LS_CHECKED_OBJECT TYPE E071,
        LS_CHECKED_TADIR TYPE TADIR,
        LT_INACTIVE_LOG TYPE STANDARD TABLE OF SPROT_U,
        LS_INACTIVE_LOG TYPE SPROT_U,
        LT_INACTIVE_OBJECTS TYPE STANDARD TABLE OF E071,
        LS_INACTIVE_OBJECT TYPE E071,
        LS_RELEASE_E070 TYPE TRWBO_S_E070,
        LV_CHECK_RC   TYPE I,
        LV_OBJECT_CHECK_RC TYPE SY-SUBRC,
        LV_AUTH_ERROR TYPE C,
        LV_TASK_STATUS TYPE CHAR10,
        LV_TASK_MESSAGE TYPE CHAR255,
        LV_OBJ_STATUS TYPE CHAR10,
        LV_OBJ_MESSAGE TYPE CHAR255,
        LV_MSG_TEXT   TYPE CHAR255,
        LV_INACTIVE_TEXT TYPE CHAR255,
        LV_INACTIVE_DESC TYPE CHAR255,
        LV_OBJECT_ERROR_COUNT TYPE I,
        LV_OBJECT_ERROR_COUNT_C(3) TYPE C,
        LV_OBJ_SEQ    TYPE I,
        LV_OBJ_SEQ_C(3) TYPE C.

  CLEAR: EV_SUCCESS, EV_MESSAGE.
  REFRESH ET_RESULTS.

  IF IV_MODE <> 'TEST_RUN' AND IV_MODE <> 'RELEASE'.
    EV_MESSAGE = 'MODE_NOT_ALLOWED'.
    RETURN.
  ENDIF.
  IF IV_TRKORR IS INITIAL.
    EV_MESSAGE = 'TRKORR_REQUIRED'.
    RETURN.
  ENDIF.

* --- Parent header ---
  SELECT SINGLE TRFUNCTION TRSTATUS AS4USER STRKORR
    INTO (LV_TRFUNCTION, LV_TRSTATUS,
          LV_AS4USER, LV_STRKORR)
    FROM E070
    WHERE TRKORR = IV_TRKORR.
  IF SY-SUBRC <> 0.
    EV_MESSAGE = 'REQUEST_NOT_FOUND'.
    RETURN.
  ENDIF.
  IF LV_AS4USER <> SY-UNAME.
    EV_MESSAGE = 'NOT_OWNER'.
    RETURN.
  ENDIF.
  IF LV_STRKORR IS NOT INITIAL.
    EV_MESSAGE = 'NOT_A_PARENT_REQUEST'.
    RETURN.
  ENDIF.
  IF LV_TRFUNCTION <> 'K' AND LV_TRFUNCTION <> 'W'.
    EV_MESSAGE = 'INVALID_REQUEST_TYPE'.
    RETURN.
  ENDIF.
  IF LV_TRSTATUS <> 'D'.
    IF LV_TRSTATUS = 'R' OR LV_TRSTATUS = 'N'.
      IF IV_MODE = 'RELEASE'.
        SELECT SINGLE AS4TEXT INTO LV_AS4TEXT
          FROM E07T
          WHERE TRKORR = IV_TRKORR AND LANGU = 'E'.
        IF SY-SUBRC <> 0.
          SELECT SINGLE AS4TEXT INTO LV_AS4TEXT
            FROM E07T WHERE TRKORR = IV_TRKORR.
        ENDIF.
        LV_SEQ_C = '1'.
        CLEAR LV_BUF.
        CONCATENATE IV_TRKORR LV_TRFUNCTION LV_AS4TEXT
          'RELEASED' 'Already released' LV_SEQ_C
          INTO LV_BUF SEPARATED BY '|'.
        LV_LINE-LINE = LV_BUF.
        APPEND LV_LINE TO ET_RESULTS.
        EV_SUCCESS = 'X'.
        EV_MESSAGE = 'RELEASE_COMPLETE'.
      ELSE.
        EV_MESSAGE = 'ALREADY_RELEASED'.
      ENDIF.
    ELSE.
      EV_MESSAGE = 'REQUEST_NOT_MODIFIABLE'.
    ENDIF.
    RETURN.
  ENDIF.

* Use SAP's own mapping from request function to S_TRANSPRT TTYPE.
  CALL FUNCTION 'TR_AUTHORITY_CHECK_TRFUNCTION'
    EXPORTING
      IV_TRFUNCTION = LV_TRFUNCTION
      IV_ACTIVITY   = 'RELE'
      IV_USER       = SY-UNAME
    EXCEPTIONS
      E_NO_AUTHORITY = 1
      E_INVALID_USER = 2
      OTHERS         = 3.
  IF SY-SUBRC <> 0.
    EV_MESSAGE = 'AUTHORIZATION_FAILED'.
    RETURN.
  ENDIF.

  SELECT SINGLE AS4TEXT INTO LV_AS4TEXT
    FROM E07T
    WHERE TRKORR = IV_TRKORR AND LANGU = 'E'.
  IF SY-SUBRC <> 0.
    SELECT SINGLE AS4TEXT INTO LV_AS4TEXT
      FROM E07T WHERE TRKORR = IV_TRKORR.
  ENDIF.

  SELECT * INTO TABLE LT_CHILDREN
    FROM E070
    WHERE STRKORR = IV_TRKORR
    ORDER BY TRKORR.

  LV_SEQ = 0.
  LV_HAS_ERROR = SPACE.

  LOOP AT LT_CHILDREN INTO LS_CHILD.
    LV_SEQ = LV_SEQ + 1.
    LV_SEQ_C = LV_SEQ.
    CONDENSE LV_SEQ_C.

    CLEAR LV_CHILD_TEXT.
    SELECT SINGLE AS4TEXT INTO LV_CHILD_TEXT
      FROM E07T
      WHERE TRKORR = LS_CHILD-TRKORR
        AND LANGU = 'E'.
    IF SY-SUBRC <> 0.
      SELECT SINGLE AS4TEXT INTO LV_CHILD_TEXT
        FROM E07T
        WHERE TRKORR = LS_CHILD-TRKORR.
    ENDIF.

*   --- Already released: nothing to do ---
    IF LS_CHILD-TRSTATUS = 'R'
      OR LS_CHILD-TRSTATUS = 'N'.
      CLEAR LV_BUF.
      CONCATENATE LS_CHILD-TRKORR
        LS_CHILD-TRFUNCTION LV_CHILD_TEXT
        'SKIPPED' 'Already released' LV_SEQ_C
        INTO LV_BUF SEPARATED BY '|'.
      LV_LINE-LINE = LV_BUF.
      APPEND LV_LINE TO ET_RESULTS.
      CONTINUE.
    ENDIF.

*   --- Not modifiable: hard error ---
    IF LS_CHILD-TRSTATUS <> 'D'.
      CLEAR LV_BUF.
      CONCATENATE LS_CHILD-TRKORR
        LS_CHILD-TRFUNCTION LV_CHILD_TEXT
        'ERROR' 'Task not modifiable' LV_SEQ_C
        INTO LV_BUF SEPARATED BY '|'.
      LV_LINE-LINE = LV_BUF.
      APPEND LV_LINE TO ET_RESULTS.
      LV_HAS_ERROR = 'X'.
      CONTINUE.
    ENDIF.

*   --- TEST_RUN: report readiness only ---
    IF IV_MODE = 'TEST_RUN'.
      REFRESH LT_OBJECTS.
      SELECT * INTO TABLE LT_OBJECTS
        FROM E071
        WHERE TRKORR = LS_CHILD-TRKORR.
      DESCRIBE TABLE LT_OBJECTS LINES LV_OBJ_CNT.
      CLEAR LV_BUF.
      IF LV_OBJ_CNT = 0.
        CONCATENATE LS_CHILD-TRKORR
          LS_CHILD-TRFUNCTION LV_CHILD_TEXT
          'WARNING' 'Task has no objects' LV_SEQ_C
          INTO LV_BUF SEPARATED BY '|'.
      ELSE.
        CLEAR LS_REQUEST.
        REFRESH LT_MESSAGES.
        REFRESH LT_FAILED_OBJECTS.
        CLEAR LV_AUTH_ERROR.
        CALL FUNCTION 'TR_READ_REQUEST'
          EXPORTING
            IV_TRKORR         = LS_CHILD-TRKORR
            IV_READ_E070      = 'X'
            IV_READ_E07T      = 'X'
            IV_READ_OBJS_KEYS = 'X'
          CHANGING
            CS_REQUEST        = LS_REQUEST
          EXCEPTIONS
            ERROR_OCCURED     = 1
            NO_AUTHORIZATION  = 2
            OTHERS            = 3.
        LV_CHECK_RC = SY-SUBRC.
        LV_TASK_STATUS = 'PASS'.
        LV_TASK_MESSAGE = 'Ready for release'.

        IF LV_CHECK_RC <> 0.
          LV_TASK_STATUS = 'ERROR'.
          LV_TASK_MESSAGE = 'Unable to read request objects'.
        ELSE.
          CALL FUNCTION 'TR_CHECK_REQUEST'
            EXPORTING
              IS_REQUEST          = LS_REQUEST
              IV_CHECK_LOCKABILITY = 'X'
              IV_COLLECT_MODE     = 'X'
            IMPORTING
              ET_MESSAGES         = LT_MESSAGES
            EXCEPTIONS
              ATTRIBUTE_ERROR     = 1
              HEADER_ERROR        = 2
              OBJ_OR_KEY_ERROR    = 3
              OTHERS              = 4.
          LV_CHECK_RC = SY-SUBRC.

          LOOP AT LT_MESSAGES INTO LS_MESSAGE.
            CLEAR LV_MSG_TEXT.
            MESSAGE ID LS_MESSAGE-MSGID TYPE 'S'
              NUMBER LS_MESSAGE-MSGNO
              WITH LS_MESSAGE-MSGV1 LS_MESSAGE-MSGV2
                   LS_MESSAGE-MSGV3 LS_MESSAGE-MSGV4
              INTO LV_MSG_TEXT.
            IF LS_MESSAGE-MSGTY = 'E'
              OR LS_MESSAGE-MSGTY = 'A'
              OR LS_MESSAGE-MSGTY = 'X'.
              LV_TASK_STATUS = 'ERROR'.
              LV_TASK_MESSAGE = LV_MSG_TEXT.
            ELSEIF LS_MESSAGE-MSGTY = 'W'
              AND LV_TASK_STATUS <> 'ERROR'.
              LV_TASK_STATUS = 'WARNING'.
              LV_TASK_MESSAGE = LV_MSG_TEXT.
            ENDIF.
          ENDLOOP.

          IF LV_CHECK_RC <> 0 AND LV_TASK_STATUS <> 'ERROR'.
            LV_TASK_STATUS = 'ERROR'.
            LV_TASK_MESSAGE = 'Request consistency check failed'.
          ENDIF.

*         Run SAP CTS release preflight for every object. This resolves
*         LIMU entries to their repository object, validates TADIR/package
*         consistency, and checks that locks belong to this task/request.
          LOOP AT LT_OBJECTS INTO LS_OBJECT.
            REFRESH LT_OBJECT_MESSAGES.
            CLEAR: LS_CHECKED_OBJECT, LS_CHECKED_TADIR.
            CALL FUNCTION 'TR_REQ_CHECK_OBJECT'
              EXPORTING
                IS_OBJECT               = LS_OBJECT
                IS_REQUEST_HEADER       = LS_REQUEST-H
                IV_ACCEPT_MISSING_TADIR = SPACE
                IV_CHECK_LOCKABILITY    = 'X'
                IV_COLLECT_MODE         = 'X'
                IV_DIALOG               = SPACE
                IV_RELEASE_CHECKS       = 'X'
              IMPORTING
                ES_OBJECT               = LS_CHECKED_OBJECT
                ES_TADIR                = LS_CHECKED_TADIR
              CHANGING
                CT_MESSAGES             = LT_OBJECT_MESSAGES
              EXCEPTIONS
                INVALID_REQUEST              = 1
                INVALID_SYNTAX               = 2
                INVALID_OBJECT               = 3
                INVALID_TRANSPORT_PROPERTIES = 4
                INVALID_LOCKS                = 5
                WRONG_CALL                   = 6
                OTHERS                       = 7.
            LV_OBJECT_CHECK_RC = SY-SUBRC.
            APPEND LINES OF LT_OBJECT_MESSAGES TO LT_MESSAGES.

            LOOP AT LT_OBJECT_MESSAGES INTO LS_MESSAGE.
              CLEAR LV_MSG_TEXT.
              MESSAGE ID LS_MESSAGE-MSGID TYPE 'S'
                NUMBER LS_MESSAGE-MSGNO
                WITH LS_MESSAGE-MSGV1 LS_MESSAGE-MSGV2
                     LS_MESSAGE-MSGV3 LS_MESSAGE-MSGV4
                INTO LV_MSG_TEXT.
              IF LS_MESSAGE-MSGTY = 'E'
                OR LS_MESSAGE-MSGTY = 'A'
                OR LS_MESSAGE-MSGTY = 'X'.
                LV_TASK_STATUS = 'ERROR'.
                LV_TASK_MESSAGE = LV_MSG_TEXT.
              ELSEIF LS_MESSAGE-MSGTY = 'W'
                AND LV_TASK_STATUS <> 'ERROR'.
                LV_TASK_STATUS = 'WARNING'.
                LV_TASK_MESSAGE = LV_MSG_TEXT.
              ENDIF.
            ENDLOOP.

            IF LV_OBJECT_CHECK_RC <> 0.
              APPEND LS_OBJECT TO LT_FAILED_OBJECTS.
              LV_TASK_STATUS = 'ERROR'.
              IF LT_OBJECT_MESSAGES IS INITIAL.
                LV_TASK_MESSAGE =
                  'Repository or lock consistency check failed'.
              ENDIF.
            ENDIF.
          ENDLOOP.

*         Use the same CTS authorization mapping as SAP's transport tools.
*         RELE maps to S_TRANSPRT activity 43 and the actual request type.
          CALL FUNCTION 'TR_AUTHORITY_CHECK_TRFUNCTION'
            EXPORTING
              IV_TRFUNCTION = LS_CHILD-TRFUNCTION
              IV_ACTIVITY   = 'RELE'
              IV_USER       = SY-UNAME
            EXCEPTIONS
              E_NO_AUTHORITY = 1
              E_INVALID_USER = 2
              OTHERS         = 3.
          IF SY-SUBRC <> 0.
            LV_AUTH_ERROR = 'X'.
            LV_TASK_STATUS = 'ERROR'.
            LV_TASK_MESSAGE = 'Authorization preflight failed'.
          ENDIF.

*         Use SAP's own release-time inactive check. It covers every
*         R3TR/LIMU object and delegates type-specific checks internally.
          REFRESH LT_INACTIVE_LOG.
          CLEAR LS_RELEASE_E070.
          MOVE-CORRESPONDING LS_CHILD TO LS_RELEASE_E070.
          CALL FUNCTION 'TRINT_CHECK_INACTIVE_OBJECTS'
            EXPORTING
              IS_E070 = LS_RELEASE_E070
              IT_E071 = LT_OBJECTS
            TABLES
              ET_LOG  = LT_INACTIVE_LOG.

          LOOP AT LT_INACTIVE_LOG INTO LS_INACTIVE_LOG
            WHERE SEVERITY = 'W'
               OR SEVERITY = 'E'
               OR SEVERITY = 'A'.
            CLEAR: LV_INACTIVE_TEXT, LV_INACTIVE_DESC.
            CASE LS_INACTIVE_LOG-VAR1.
              WHEN 'REPT'.
                LV_INACTIVE_DESC = 'Program Text / Selection Texts'.
              WHEN 'REPS'.
                LV_INACTIVE_DESC = 'ABAP Source/Include'.
              WHEN OTHERS.
                LV_INACTIVE_DESC = LS_INACTIVE_LOG-VAR1.
            ENDCASE.
            LV_TASK_STATUS = 'ERROR'.
            CONCATENATE 'Inactive' LV_INACTIVE_DESC ':'
              LS_INACTIVE_LOG-VAR2
              INTO LV_TASK_MESSAGE SEPARATED BY SPACE.
            EXIT.
          ENDLOOP.

*         Summarize unique inactive objects at task level. The detailed
*         object rows below remain the source of the individual diagnostics.
          REFRESH LT_INACTIVE_OBJECTS.
          LOOP AT LT_OBJECTS INTO LS_OBJECT.
            LOOP AT LT_INACTIVE_LOG INTO LS_INACTIVE_LOG
              WHERE VAR2 = LS_OBJECT-OBJ_NAME
                AND ( SEVERITY = 'W'
                   OR SEVERITY = 'E'
                   OR SEVERITY = 'A' ).
              APPEND LS_OBJECT TO LT_INACTIVE_OBJECTS.
              EXIT.
            ENDLOOP.
          ENDLOOP.
          SORT LT_INACTIVE_OBJECTS BY PGMID OBJECT OBJ_NAME.
          DELETE ADJACENT DUPLICATES FROM LT_INACTIVE_OBJECTS
            COMPARING PGMID OBJECT OBJ_NAME.
          DESCRIBE TABLE LT_INACTIVE_OBJECTS LINES LV_OBJECT_ERROR_COUNT.
          IF LV_OBJECT_ERROR_COUNT > 1.
            LV_OBJECT_ERROR_COUNT_C = LV_OBJECT_ERROR_COUNT.
            CONDENSE LV_OBJECT_ERROR_COUNT_C.
            CONCATENATE LV_OBJECT_ERROR_COUNT_C
              'object errors found. See object details below.'
              INTO LV_TASK_MESSAGE SEPARATED BY SPACE.
          ENDIF.
        ENDIF.

        CONCATENATE LS_CHILD-TRKORR
          LS_CHILD-TRFUNCTION LV_CHILD_TEXT
          LV_TASK_STATUS LV_TASK_MESSAGE LV_SEQ_C
          INTO LV_BUF SEPARATED BY '|'.
      ENDIF.
      LV_LINE-LINE = LV_BUF.
      APPEND LV_LINE TO ET_RESULTS.

      IF LV_OBJ_CNT > 0.
        LV_OBJ_SEQ = 0.
        LOOP AT LT_OBJECTS INTO LS_OBJECT.
          LV_OBJ_SEQ = LV_OBJ_SEQ + 1.
          LV_OBJ_SEQ_C = LV_OBJ_SEQ.
          CONDENSE LV_OBJ_SEQ_C.
          LV_OBJ_STATUS = 'PASS'.
          LV_OBJ_MESSAGE = 'CTS preflight and inactive-state validation passed'.

          IF LV_AUTH_ERROR = 'X'.
            LV_OBJ_STATUS = 'ERROR'.
            LV_OBJ_MESSAGE = 'Authorization preflight failed'.
          ENDIF.

          READ TABLE LT_FAILED_OBJECTS INTO LS_FAILED_OBJECT
            WITH KEY PGMID = LS_OBJECT-PGMID
                     OBJECT = LS_OBJECT-OBJECT
                     OBJ_NAME = LS_OBJECT-OBJ_NAME.
          IF SY-SUBRC = 0.
            LV_OBJ_STATUS = 'ERROR'.
            LV_OBJ_MESSAGE =
              'Repository or lock consistency check failed'.
          ENDIF.

          LOOP AT LT_MESSAGES INTO LS_MESSAGE
            WHERE K_PGMID = LS_OBJECT-PGMID
              AND K_OBJECT = LS_OBJECT-OBJECT
              AND K_OBJNAME = LS_OBJECT-OBJ_NAME.
            CLEAR LV_MSG_TEXT.
            MESSAGE ID LS_MESSAGE-MSGID TYPE 'S'
              NUMBER LS_MESSAGE-MSGNO
              WITH LS_MESSAGE-MSGV1 LS_MESSAGE-MSGV2
                   LS_MESSAGE-MSGV3 LS_MESSAGE-MSGV4
              INTO LV_MSG_TEXT.
            IF LS_MESSAGE-MSGTY = 'E'
              OR LS_MESSAGE-MSGTY = 'A'
              OR LS_MESSAGE-MSGTY = 'X'.
              LV_OBJ_STATUS = 'ERROR'.
              LV_OBJ_MESSAGE = LV_MSG_TEXT.
              EXIT.
            ELSEIF LS_MESSAGE-MSGTY = 'W'
              AND LV_OBJ_STATUS <> 'ERROR'.
              LV_OBJ_STATUS = 'WARNING'.
              LV_OBJ_MESSAGE = LV_MSG_TEXT.
            ENDIF.
          ENDLOOP.

          LOOP AT LT_INACTIVE_LOG INTO LS_INACTIVE_LOG
            WHERE VAR2 = LS_OBJECT-OBJ_NAME
              AND ( SEVERITY = 'W'
                 OR SEVERITY = 'E'
                 OR SEVERITY = 'A' ).
            CLEAR LV_INACTIVE_DESC.
            CASE LS_INACTIVE_LOG-VAR1.
              WHEN 'REPT'.
                LV_INACTIVE_DESC = 'Program Text / Selection Texts'.
              WHEN 'REPS'.
                LV_INACTIVE_DESC = 'ABAP Source/Include'.
              WHEN OTHERS.
                LV_INACTIVE_DESC = LS_INACTIVE_LOG-VAR1.
            ENDCASE.
            LV_OBJ_STATUS = 'ERROR'.
            CONCATENATE 'Inactive' LV_INACTIVE_DESC ':'
              LS_INACTIVE_LOG-VAR2
              INTO LV_OBJ_MESSAGE SEPARATED BY SPACE.
            EXIT.
          ENDLOOP.

          CLEAR LV_BUF.
          CONCATENATE 'OBJECT' LS_CHILD-TRKORR
            LS_OBJECT-PGMID LS_OBJECT-OBJECT
            LS_OBJECT-OBJ_NAME LV_OBJ_STATUS
            LV_OBJ_MESSAGE LV_OBJ_SEQ_C
            INTO LV_BUF SEPARATED BY '|'.
          LV_LINE-LINE = LV_BUF.
          APPEND LV_LINE TO ET_RESULTS.
        ENDLOOP.

        IF LV_TASK_STATUS = 'ERROR'.
          LV_HAS_ERROR = 'X'.
        ENDIF.
      ENDIF.
      CONTINUE.
    ENDIF.

*   --- RELEASE: skip empty tasks ---
    REFRESH LT_OBJECTS.
    SELECT * INTO TABLE LT_OBJECTS
      FROM E071
      WHERE TRKORR = LS_CHILD-TRKORR.
    DESCRIBE TABLE LT_OBJECTS LINES LV_OBJ_CNT.
    IF LV_OBJ_CNT = 0.
      CLEAR LV_BUF.
      CONCATENATE LS_CHILD-TRKORR
        LS_CHILD-TRFUNCTION LV_CHILD_TEXT
        'SKIPPED' 'Empty task skipped' LV_SEQ_C
        INTO LV_BUF SEPARATED BY '|'.
      LV_LINE-LINE = LV_BUF.
      APPEND LV_LINE TO ET_RESULTS.
      CONTINUE.
    ENDIF.

*   --- RELEASE: start task release, retry transient CTS races ---
    CLEAR: LV_SUBRC, LV_VERIFIED_STATUS.
    LV_RELEASE_ATTEMPTS = 0.
    DO 3 TIMES.
      LV_RELEASE_ATTEMPTS = LV_RELEASE_ATTEMPTS + 1.
      CALL FUNCTION 'TR_RELEASE_REQUEST'
        EXPORTING
          IV_TRKORR             = LS_CHILD-TRKORR
          IV_DIALOG             = ' '
          IV_AS_BACKGROUND_JOB  = 'X'
          IV_SUCCESS_MESSAGE    = ' '
          IV_DISPLAY_EXPORT_LOG = ' '
        EXCEPTIONS
          ACTION_ABORTED_BY_USER     = 1
          CTS_INITIALIZATION_FAILURE = 2
          DB_ACCESS_ERROR            = 3
          DOCU_MISSING               = 4
          ENQUEUE_FAILED             = 5
          ERROR_IN_EXPORT_METHODS    = 6
          EXPORT_FAILED              = 7
          INVALID_REQUEST            = 8
          NO_AUTHORIZATION           = 9
          OBJECT_CHECK_ERROR         = 10
          REPEAT_TOO_EARLY           = 11
          REQUEST_ALREADY_RELEASED   = 12
          OTHERS                     = 13.
      LV_SUBRC = SY-SUBRC.
      IF LV_SUBRC = 0 OR LV_SUBRC = 12.
        EXIT.
      ENDIF.
      IF LV_SUBRC = 5 OR LV_SUBRC = 11.
        WAIT UP TO 2 SECONDS.
      ELSE.
        EXIT.
      ENDIF.
    ENDDO.

*   The immediate return code is not final release status. SAP can keep
*   processing the background export after returning a non-zero code.
*   Always wait for the authoritative E070 state before deciding.
    LV_WAIT_COUNT = 0.
    DO 15 TIMES.
      LV_WAIT_COUNT = LV_WAIT_COUNT + 1.
      CLEAR LV_VERIFIED_STATUS.
      SELECT SINGLE TRSTATUS INTO LV_VERIFIED_STATUS
        FROM E070
        WHERE TRKORR = LS_CHILD-TRKORR.
      IF LV_VERIFIED_STATUS = 'R'
        OR LV_VERIFIED_STATUS = 'N'.
        EXIT.
      ENDIF.
      WAIT UP TO 2 SECONDS.
    ENDDO.

    CLEAR: LV_BUF, LV_TASK_STATUS, LV_TASK_MESSAGE.
    IF LV_VERIFIED_STATUS = 'R'
      OR LV_VERIFIED_STATUS = 'N'.
      LV_TASK_STATUS = 'RELEASED'.
      LV_TASK_MESSAGE = 'Released successfully'.
    ELSEIF LV_SUBRC = 0 OR LV_SUBRC = 12.
      LV_TASK_STATUS = 'ERROR'.
      LV_TASK_MESSAGE =
        'Release confirmation timeout; check SAP status'.
      LV_HAS_ERROR = 'X'.
    ELSE.
      LV_RC_C = LV_SUBRC.
      CONDENSE LV_RC_C.
      LV_TASK_STATUS = 'ERROR'.
      CONCATENATE 'Release failed RC' LV_RC_C
        INTO LV_TASK_MESSAGE SEPARATED BY SPACE.
      LV_HAS_ERROR = 'X'.
    ENDIF.
    CONCATENATE LS_CHILD-TRKORR
      LS_CHILD-TRFUNCTION LV_CHILD_TEXT
      LV_TASK_STATUS LV_TASK_MESSAGE LV_SEQ_C
      INTO LV_BUF SEPARATED BY '|'.
    LV_LINE-LINE = LV_BUF.
    APPEND LV_LINE TO ET_RESULTS.

    LV_OBJ_SEQ = 0.
    LOOP AT LT_OBJECTS INTO LS_OBJECT.
      LV_OBJ_SEQ = LV_OBJ_SEQ + 1.
      LV_OBJ_SEQ_C = LV_OBJ_SEQ.
      CONDENSE LV_OBJ_SEQ_C.
      CLEAR LV_BUF.
      CONCATENATE 'OBJECT' LS_CHILD-TRKORR
        LS_OBJECT-PGMID LS_OBJECT-OBJECT LS_OBJECT-OBJ_NAME
        LV_TASK_STATUS LV_TASK_MESSAGE LV_OBJ_SEQ_C
        INTO LV_BUF SEPARATED BY '|'.
      LV_LINE-LINE = LV_BUF.
      APPEND LV_LINE TO ET_RESULTS.
    ENDLOOP.
  ENDLOOP.

* --- Parent entry ---
  LV_SEQ = LV_SEQ + 1.
  LV_SEQ_C = LV_SEQ.
  CONDENSE LV_SEQ_C.

  IF IV_MODE = 'TEST_RUN'.
    CLEAR LV_BUF.
    IF LV_HAS_ERROR = 'X'.
      CONCATENATE IV_TRKORR LV_TRFUNCTION LV_AS4TEXT
        'ERROR' 'Blocked by task errors' LV_SEQ_C
        INTO LV_BUF SEPARATED BY '|'.
      LV_LINE-LINE = LV_BUF.
      APPEND LV_LINE TO ET_RESULTS.
      EV_MESSAGE = 'TEST_RUN_HAS_ERRORS'.
    ELSE.
      CONCATENATE IV_TRKORR LV_TRFUNCTION LV_AS4TEXT
        'PASS' 'Ready for release' LV_SEQ_C
        INTO LV_BUF SEPARATED BY '|'.
      LV_LINE-LINE = LV_BUF.
      APPEND LV_LINE TO ET_RESULTS.
      EV_SUCCESS = 'X'.
      EV_MESSAGE = 'TEST_RUN_OK'.
    ENDIF.
    RETURN.
  ENDIF.

* --- Do not release parent if a task failed ---
  IF LV_HAS_ERROR = 'X'.
    CLEAR LV_BUF.
    CONCATENATE IV_TRKORR LV_TRFUNCTION LV_AS4TEXT
      'ERROR' 'Blocked by task errors' LV_SEQ_C
      INTO LV_BUF SEPARATED BY '|'.
    LV_LINE-LINE = LV_BUF.
    APPEND LV_LINE TO ET_RESULTS.
    EV_MESSAGE = 'PARTIAL_RELEASE_TASK_FAILED'.
    RETURN.
  ENDIF.

* --- Release parent and retry transient CTS races ---
  CLEAR: LV_SUBRC, LV_VERIFIED_STATUS.
  LV_RELEASE_ATTEMPTS = 0.
  DO 3 TIMES.
    LV_RELEASE_ATTEMPTS = LV_RELEASE_ATTEMPTS + 1.
    CALL FUNCTION 'TR_RELEASE_REQUEST'
      EXPORTING
        IV_TRKORR             = IV_TRKORR
        IV_DIALOG             = ' '
        IV_AS_BACKGROUND_JOB  = 'X'
        IV_SUCCESS_MESSAGE    = ' '
        IV_DISPLAY_EXPORT_LOG = ' '
      EXCEPTIONS
        ACTION_ABORTED_BY_USER     = 1
        CTS_INITIALIZATION_FAILURE = 2
        DB_ACCESS_ERROR            = 3
        DOCU_MISSING               = 4
        ENQUEUE_FAILED             = 5
        ERROR_IN_EXPORT_METHODS    = 6
        EXPORT_FAILED              = 7
        INVALID_REQUEST            = 8
        NO_AUTHORIZATION           = 9
        OBJECT_CHECK_ERROR         = 10
        REPEAT_TOO_EARLY           = 11
        REQUEST_ALREADY_RELEASED   = 12
        OTHERS                     = 13.
    LV_SUBRC = SY-SUBRC.
    IF LV_SUBRC = 0 OR LV_SUBRC = 12.
      EXIT.
    ENDIF.
    IF LV_SUBRC = 5 OR LV_SUBRC = 11.
      WAIT UP TO 2 SECONDS.
    ELSE.
      EXIT.
    ENDIF.
  ENDDO.

* Confirm that SAP completed the parent release before reporting success.
* Poll even after a non-zero immediate return code because the background
* export may still be running.
  LV_WAIT_COUNT = 0.
  DO 15 TIMES.
    LV_WAIT_COUNT = LV_WAIT_COUNT + 1.
    CLEAR LV_VERIFIED_STATUS.
    SELECT SINGLE TRSTATUS INTO LV_VERIFIED_STATUS
      FROM E070
      WHERE TRKORR = IV_TRKORR.
    IF LV_VERIFIED_STATUS = 'R'
      OR LV_VERIFIED_STATUS = 'N'.
      EXIT.
    ENDIF.
    WAIT UP TO 2 SECONDS.
  ENDDO.

  CLEAR LV_BUF.
  IF LV_VERIFIED_STATUS = 'R'
    OR LV_VERIFIED_STATUS = 'N'.
    CONCATENATE IV_TRKORR LV_TRFUNCTION LV_AS4TEXT
      'RELEASED' 'Released successfully' LV_SEQ_C
      INTO LV_BUF SEPARATED BY '|'.
    LV_LINE-LINE = LV_BUF.
    APPEND LV_LINE TO ET_RESULTS.
    EV_SUCCESS = 'X'.
    EV_MESSAGE = 'RELEASE_COMPLETE'.
  ELSEIF LV_SUBRC = 0 OR LV_SUBRC = 12.
    CONCATENATE IV_TRKORR LV_TRFUNCTION LV_AS4TEXT
      'ERROR' 'Release confirmation timeout; check SAP status'
      LV_SEQ_C
      INTO LV_BUF SEPARATED BY '|'.
    LV_LINE-LINE = LV_BUF.
    APPEND LV_LINE TO ET_RESULTS.
    EV_MESSAGE = 'RELEASE_CONFIRMATION_TIMEOUT'.
  ELSE.
    LV_RC_C = LV_SUBRC.
    CONDENSE LV_RC_C.
    CONCATENATE IV_TRKORR LV_TRFUNCTION LV_AS4TEXT
      'ERROR' LV_RC_C LV_SEQ_C
      INTO LV_BUF SEPARATED BY '|'.
    LV_LINE-LINE = LV_BUF.
    APPEND LV_LINE TO ET_RESULTS.
    EV_MESSAGE = 'PARENT_RELEASE_FAILED'.
  ENDIF.

ENDFUNCTION.
