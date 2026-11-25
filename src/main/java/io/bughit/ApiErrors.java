package io.bughit;

import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
class ApiErrors {
    static ResponseStatusException error(HttpStatus status, String reason) { return new ResponseStatusException(status, reason); }

    @ExceptionHandler(ResponseStatusException.class)
    ProblemDetail status(ResponseStatusException exception) { return exception.getBody(); }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail invalid(MethodArgumentNotValidException exception) {
        var field = exception.getBindingResult().getFieldError();
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                field == null ? "Check your input." : field.getField() + " " + field.getDefaultMessage() + ".");
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, ConstraintViolationException.class})
    ProblemDetail malformed(Exception exception) { return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Check the submitted data."); }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ProblemDetail tooLarge() { return ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE, "Screenshots must be 5 MB or smaller."); }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ProblemDetail changed() { return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "This issue changed. Refresh and try again."); }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail conflict() { return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "A record already exists or changed. Refresh and try again."); }
}
